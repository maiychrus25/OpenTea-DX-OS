// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { AppStoreUseCase } from '@/application/apps/app-store.usecase'
import { assertInstallable } from '@/application/appbuilder/install-check'
import type { Evidence } from '@/domain/agent/proposal'
import { AppBuildError } from '@/domain/appbuilder/app-build'
import { AppStoreError } from '@/domain/entities/app-store'
import { ValidationError } from '@/domain/errors'
import { PrismaAppBuildRepository } from '@/infrastructure/db/appbuilder/PrismaAppBuildRepository'
import { PrismaAppStoreRepository } from '@/infrastructure/db/repositories/prisma-app-store-repository'
import type { ActionDefinition } from '../action-catalog'
import { isEvidenceStale } from './journal-evidence'

/** The pattern of "id" in platform/apps/manifest.schema.json (31 characters at most, `gen-` ids included). */
export const MINIAPP_ID_PATTERN = /^[a-z][a-z0-9-]{1,30}$/
export const miniappPayloadSchema = z.object({ app_id: z.string().regex(MINIAPP_ID_PATTERN) }).strict()

export type MiniappInstallPayload = z.infer<typeof miniappPayloadSchema>

/** An error a person can read, as a validation refusal, instead of the generic failure line. */
export function readable(error: unknown): never {
  if (error instanceof AppBuildError || error instanceof AppStoreError) throw new ValidationError(error.message)
  throw error
}

/** Enables a mini-app for the proposal's cooperative only, through the App Store request the worker already handles. */
export const miniappInstallAction: ActionDefinition<MiniappInstallPayload> = {
  kind: 'miniapp.install',
  titleVi: 'Cài mini-app',
  risk: 'high',
  approverRoles: ['manager'],
  origins: ['agent'],
  autonomy: 'unlockable',
  channels: ['web', 'telegram'],
  payloadSchema: miniappPayloadSchema,
  editableFields: [],
  humanOnlyFields: [],
  subjectTable: null,
  repeatAfterHours: null,
  expiresAfterHours: 168,
  async validate(payload, ctx) {
    await assertInstallable(new PrismaAppBuildRepository(), ctx.htxCode, payload.app_id).catch(readable)
  },
  preview(payload, _subjects, evidence?: Evidence) {
    const values = evidence?.rows.find((row) => row.table === 'app_build_requests')?.values
    const name = typeof values?.name_vi === 'string' ? values.name_vi : payload.app_id
    const lines = [`Bật "${name}" cho HTX của bạn`]
    if (payload.app_id.startsWith('gen-')) {
      lines.push('App do AI xây')
      if (typeof values?.gates_total === 'number') lines.push(`Qua ${values.gates_passed}/${values.gates_total} cổng kiểm tra`)
    }
    return lines
  },
  subjects(payload) {
    return [payload.app_id]
  },
  async isStale(payload, evidence, ctx) {
    if (await isEvidenceStale(evidence, ctx.htxCode, ctx.loaders)) return true
    return assertInstallable(new PrismaAppBuildRepository(), ctx.htxCode, payload.app_id).then(
      () => false,
      () => true
    )
  },
  async execute(payload, approver) {
    const builds = new PrismaAppBuildRepository()
    await assertInstallable(builds, approver.htxCode, payload.app_id).catch(readable)
    const store = new AppStoreUseCase(new PrismaAppStoreRepository())
    const status = await store
      .requestChange({ htxCode: approver.htxCode, userId: approver.userId, userName: null }, payload.app_id, 'ENABLE')
      .catch(readable)
    await builds.markInstalledByApp(approver.htxCode, payload.app_id)
    return { app_id: payload.app_id, status, request_id: await builds.latestStoreRequestId(approver.htxCode, payload.app_id) }
  },
}
