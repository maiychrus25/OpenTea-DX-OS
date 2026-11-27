// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import type { Evidence } from '@/domain/agent/proposal'
import { AppBuildError } from '@/domain/appbuilder/app-build'
import { ValidationError } from '@/domain/errors'
import { appSpecSchema, specPreviewLines } from '@/application/appbuilder/app-spec'
import { PrismaAppBuildRepository } from '@/infrastructure/db/appbuilder/PrismaAppBuildRepository'
import type { ActionDefinition } from '../action-catalog'
import { isEvidenceStale } from './journal-evidence'

const payloadSchema = z.object({ request_id: z.string().uuid() }).strict()

export type AppSpecApprovePayload = z.infer<typeof payloadSchema>

/** The specification the manager approves is the only input of the code-writing step (spec §12.3). */
export const appSpecApproveAction: ActionDefinition<AppSpecApprovePayload> = {
  kind: 'app.spec.approve',
  titleVi: 'Duyệt đặc tả app',
  risk: 'medium',
  approverRoles: ['manager'],
  origins: ['agent'],
  autonomy: 'auto',
  channels: ['web', 'telegram'],
  payloadSchema,
  editableFields: [],
  humanOnlyFields: [],
  subjectTable: 'app_build_requests',
  repeatAfterHours: null,
  expiresAfterHours: 72,
  preview(_payload, _subjects, evidence?: Evidence) {
    const values = evidence?.rows.find((row) => row.table === 'app_build_requests')?.values
    const spec = appSpecSchema.safeParse(values?.spec)
    return spec.success ? specPreviewLines(spec.data) : ['Duyệt đặc tả app', 'Xây mất khoảng 10–30 phút.']
  },
  subjects(payload) {
    return [payload.request_id]
  },
  // The evidence carries the status and the whole spec, so a changed spec or a request that moved is stale.
  async isStale(_payload, evidence, ctx) {
    return isEvidenceStale(evidence, ctx.htxCode, ctx.loaders)
  },
  async execute(payload, approver) {
    const moved = await new PrismaAppBuildRepository().approveSpec(approver.htxCode, payload.request_id)
    if (!moved) throw new ValidationError(new AppBuildError('WRONG_STATE', 'Yêu cầu không còn chờ duyệt đặc tả').message)
    return { request_id: payload.request_id, status: 'spec_approved' }
  },
}
