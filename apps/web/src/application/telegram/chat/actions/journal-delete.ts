// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { DeleteJournalEntryUseCase } from '@/application/journal/DeleteJournalEntryUseCase'
import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository'
import type { ChatAction } from '../types'
import { entryLabel, ownEntryChoices, scopedEntry } from './journal-entries'

type JournalDeletePayload = { entry_id: string }

/** Routes: `DELETE /api/journal/[id]`; the use case lets only draft and pending entries go. */
export const journalDeleteAction: ChatAction<JournalDeletePayload> = {
  name: 'journal.delete',
  titleVi: 'Rút nhật ký',
  risk: 'high',
  roles: ['farmer'],
  routes: ['DELETE /api/journal/[id]'],
  args: [],
  steps: [
    { kind: 'choice', slot: 'entry_id', promptVi: 'Chọn nhật ký cần rút:', choices: (user) => ownEntryChoices(user, ['DRAFT', 'PENDING_APPROVAL']) },
  ],
  payloadSchema: z.object({ entry_id: z.string().min(1) }),
  consequenceVi: 'Nhật ký sẽ bị rút lại và xoá. Không thể khôi phục.',
  async preview(payload, user) {
    return [`Nhật ký: ${entryLabel(await scopedEntry(user, payload.entry_id))}`]
  },
  async execute(payload, user) {
    await scopedEntry(user, payload.entry_id)
    await new DeleteJournalEntryUseCase(new PrismaJournalRepository()).execute(payload.entry_id, 'FARMER', user.householdId ?? undefined)
    return 'Đã rút lại nhật ký.'
  },
}
