// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { BatchApproveJournalUseCase } from '@/application/journal/BatchApproveJournalUseCase'
import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository'
import { MinioDocumentAdapter } from '@/infrastructure/storage/minio-document.adapter'
import { TenantGuard } from '@/lib/api/tenant-guard'
import type { ActionDefinition } from '../action-catalog'
import { isEvidenceStale } from './journal-evidence'

const journalApprovePayloadSchema = z.object({
  entry_ids: z.array(z.string().min(1)).min(1).max(50),
})

export type JournalApprovePayload = z.infer<typeof journalApprovePayloadSchema>

export const journalApproveAction: ActionDefinition<JournalApprovePayload> = {
  kind: 'journal.approve',
  titleVi: 'Duyệt nhật ký canh tác',
  risk: 'medium',
  approverRoles: ['officer', 'manager'],
  origins: ['agent', 'user'],
  autonomy: 'never',
  channels: ['web', 'telegram'],
  payloadSchema: journalApprovePayloadSchema,
  editableFields: [],
  humanOnlyFields: [],
  subjectTable: 'journal_entries',
  repeatAfterHours: null,
  expiresAfterHours: 72,
  preview(payload, subjects) {
    return payload.entry_ids.map((id) => {
      const subject = subjects?.get(id)
      return subject
        ? `Duyệt nhật ký thửa ${subject.parcel} · ${subject.activity} · ${subject.day}`
        : 'Duyệt nhật ký'
    })
  },
  subjects(payload) {
    return payload.entry_ids
  },
  async isStale(_payload, evidence, ctx) {
    return isEvidenceStale(evidence, ctx.htxCode, ctx.loaders)
  },
  async execute(payload, approver) {
    const guard = new TenantGuard(approver)
    for (const id of payload.entry_ids) {
      await guard.journalEntry(id)
    }
    const useCase = new BatchApproveJournalUseCase(new PrismaJournalRepository(), new MinioDocumentAdapter())
    const result = await useCase.execute(payload.entry_ids, approver.userId, approver.htxCode)
    return { approved_count: result.approved, failed_ids: result.failed }
  },
}
