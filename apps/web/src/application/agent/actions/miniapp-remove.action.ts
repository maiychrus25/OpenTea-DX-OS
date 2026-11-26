// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { AppStoreUseCase } from '@/application/apps/app-store.usecase'
import { assertRemovable } from '@/application/appbuilder/install-check'
import { PrismaAppBuildRepository } from '@/infrastructure/db/appbuilder/PrismaAppBuildRepository'
import { PrismaAppStoreRepository } from '@/infrastructure/db/repositories/prisma-app-store-repository'
import type { ActionDefinition } from '../action-catalog'
import { miniappPayloadSchema, readable, type MiniappInstallPayload } from './miniapp-install.action'

/** Disables a mini-app for the cooperative through the store's DISABLE request, as any app is removed. */
export const miniappRemoveAction: ActionDefinition<MiniappInstallPayload> = {
  kind: 'miniapp.remove',
  titleVi: 'Gỡ mini-app',
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
    await assertRemovable(new PrismaAppBuildRepository(), ctx.htxCode, payload.app_id).catch(readable)
  },
  preview(payload) {
    return [`Gỡ "${payload.app_id}" khỏi HTX của bạn`]
  },
  subjects(payload) {
    return [payload.app_id]
  },
  async isStale(payload, _evidence, ctx) {
    return assertRemovable(new PrismaAppBuildRepository(), ctx.htxCode, payload.app_id).then(
      () => false,
      () => true
    )
  },
  async execute(payload, approver) {
    await assertRemovable(new PrismaAppBuildRepository(), approver.htxCode, payload.app_id).catch(readable)
    const status = await new AppStoreUseCase(new PrismaAppStoreRepository())
      .requestChange({ htxCode: approver.htxCode, userId: approver.userId, userName: null }, payload.app_id, 'DISABLE')
      .catch(readable)
    return {
      app_id: payload.app_id,
      status,
      request_id: await new PrismaAppBuildRepository().latestStoreRequestId(approver.htxCode, payload.app_id),
    }
  },
}
