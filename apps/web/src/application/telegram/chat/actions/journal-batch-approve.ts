// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ACTIVITY_LABEL, formatVnDayMonth } from '@/application/agent/actions/journal-labels'
import { BatchApproveJournalUseCase } from '@/application/journal/BatchApproveJournalUseCase'
import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository'
import { MinioDocumentAdapter } from '@/infrastructure/storage/minio-document.adapter'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { z } from 'zod'
import type { ChatAction } from '../types'

const MAX_BATCH = 50
const SHOWN = 5

type BatchApprovePayload = { entry_ids: string[] }

const payloadSchema = z.object({ entry_ids: z.array(z.string().min(1)).min(1).max(MAX_BATCH) })

/** Routes: `POST /api/journal/batch-approve`, for officers and managers. */
export const journalBatchApproveAction: ChatAction<BatchApprovePayload> = {
  name: 'journal.batch_approve',
  titleVi: 'Duyệt nhật ký đang chờ',
  risk: 'medium',
  roles: ['officer', 'manager'],
  routes: ['POST /api/journal/batch-approve'],
  args: [],
  // The oldest pending entries of the cooperative: the gateway lists newest first, so the tail holds the oldest.
  async start(user) {
    const repo = new PrismaJournalRepository()
    const scope = { status: 'PENDING_APPROVAL', htx_profile_id: user.tenant.htxProfileId }
    const { total } = await repo.findAll({ ...scope, limit: 1 })
    if (!total) return { replyVi: 'Không có nhật ký nào đang chờ duyệt.' }
    const { entries } = await repo.findAll({ ...scope, limit: total })
    return { state: { entry_ids: entries.slice(-MAX_BATCH).reverse().map((entry) => entry.id) } }
  },
  steps: [],
  payloadSchema,
  consequenceVi: null,
  async preview(payload, user) {
    const ids = payload.entry_ids.slice(0, SHOWN)
    const found = new Map((await new PrismaJournalRepository().findManyScoped(ids, user.tenant.htxProfileId)).map((e) => [e.id, e]))
    const lines = [`Số nhật ký: ${payload.entry_ids.length}`]
    for (const id of ids) {
      const entry = found.get(id)
      if (!entry) continue
      lines.push(`• ${entry.parcel_code ?? ''} · ${ACTIVITY_LABEL[entry.activity_type] ?? entry.activity_type} · ${formatVnDayMonth(entry.entry_date) ?? '—'}`)
    }
    if (payload.entry_ids.length > SHOWN) lines.push(`… và ${payload.entry_ids.length - SHOWN} nhật ký khác`)
    return lines
  },
  async execute(payload, user) {
    const guard = new TenantGuard(user.tenant)
    for (const id of payload.entry_ids) await guard.journalEntry(id)
    const result = await new BatchApproveJournalUseCase(new PrismaJournalRepository(), new MinioDocumentAdapter()).execute(
      payload.entry_ids,
      user.tenant.userId,
      user.tenant.htxCode
    )
    return `Đã duyệt ${result.approved} nhật ký.`
  },
}
