// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { ApproveHarvestUseCase } from '@/application/farm/approve-harvest-usecase'
import { PrismaParcelRepository } from '@/infrastructure/db/farm/PrismaParcelRepository'
import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository'
import { PrismaNotificationRepository } from '@/infrastructure/db/notification/prisma-notification-repository'
import { TenantGuard } from '@/lib/api/tenant-guard'
import type { Evidence } from '@/domain/agent/proposal'
import type { ActionDefinition } from '../action-catalog'
import { isEvidenceStale } from './journal-evidence'

const harvestApprovePayloadSchema = z.object({
  parcel_id: z.string().min(1),
}).strict()

export type HarvestApprovePayload = z.infer<typeof harvestApprovePayloadSchema>

export const harvestApproveAction: ActionDefinition<HarvestApprovePayload> = {
  kind: 'harvest.approve',
  titleVi: 'Duyệt thu hoạch',
  risk: 'high',
  approverRoles: ['manager'],
  origins: ['agent', 'user'],
  autonomy: 'unlockable',
  channels: ['web', 'telegram'],
  payloadSchema: harvestApprovePayloadSchema,
  editableFields: [],
  humanOnlyFields: [],
  subjectTable: 'parcels',
  repeatAfterHours: 24,
  expiresAfterHours: 24,
  preview(payload, _subjects, evidence?: Evidence) {
    const row = evidence?.rows.find((r) => r.table === 'parcels' && r.id === payload.parcel_id)
    const code = row?.values?.parcel_code as string | undefined
    return [code ? `Duyệt thu hoạch thửa ${code}` : 'Duyệt thu hoạch một thửa']
  },
  subjects(payload) {
    return [payload.parcel_id]
  },
  async isStale(_payload, evidence, ctx) {
    return isEvidenceStale(evidence, ctx.htxCode, ctx.loaders)
  },
  async execute(payload, approver) {
    // The use case checks the withdrawal period again, so a harvest sprayed since the proposal is refused here.
    await new TenantGuard(approver).parcel(payload.parcel_id)
    const useCase = new ApproveHarvestUseCase(
      new PrismaParcelRepository(),
      new PrismaJournalRepository(),
      new PrismaNotificationRepository()
    )
    const parcel = await useCase.execute(payload.parcel_id, approver.userId, approver.role)
    return { parcel_id: payload.parcel_id, status: parcel.status }
  },
}
