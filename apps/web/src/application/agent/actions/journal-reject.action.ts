// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { RejectJournalEntryUseCase } from '@/application/journal/RejectJournalEntryUseCase'
import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository'
import { TenantGuard } from '@/lib/api/tenant-guard'
import type { ActionDefinition } from '../action-catalog'
import { isEvidenceStale } from './journal-evidence'

const journalRejectPayloadSchema = z.object({
  entry_id: z.string().min(1),
  decision: z.enum(['REJECTED', 'REQUEST_CHANGES']).default('REQUEST_CHANGES'),
  reason_code: z.enum(['WITHDRAWAL_PERIOD', 'MISSING_INFO', 'DOSAGE', 'INCONSISTENT']),
  reason_vi: z.string().trim().min(1).max(500),
})

export type JournalRejectPayload = z.infer<typeof journalRejectPayloadSchema>

export const journalRejectAction: ActionDefinition<JournalRejectPayload> = {
  kind: 'journal.reject',
  titleVi: 'Trả lại nhật ký canh tác',
  risk: 'medium',
  approverRoles: ['officer', 'manager'],
  origins: ['agent'],
  autonomy: 'auto',
  channels: ['web', 'telegram'],
  payloadSchema: journalRejectPayloadSchema,
  editableFields: ['reason_vi'],
  expiresAfterHours: 72,
  preview(payload) {
    const verb = payload.decision === 'REJECTED' ? 'Từ chối' : 'Yêu cầu sửa'
    return [`${verb} nhật ký ${payload.entry_id}: ${payload.reason_vi}`]
  },
  async isStale(_payload, evidence, ctx) {
    return isEvidenceStale(evidence, ctx.htxCode, ctx.loaders)
  },
  async execute(payload, approver) {
    await new TenantGuard(approver).journalEntry(payload.entry_id)
    const useCase = new RejectJournalEntryUseCase(new PrismaJournalRepository())
    const result = await useCase.execute(payload.entry_id, {
      decision: payload.decision,
      reason: payload.reason_vi,
      reviewerId: approver.userId,
    })
    return { entry_id: payload.entry_id, status: result.status }
  },
}
