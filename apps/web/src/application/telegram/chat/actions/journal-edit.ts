// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { UpdateJournalEntryUseCase } from '@/application/journal/UpdateJournalEntryUseCase'
import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository'
import type { ChatAction } from '../types'
import { entryLabel, ownEntryChoices, scopedEntry } from './journal-entries'
import { clip, parseVnDate } from './scope'

const FIELDS = [
  { value: 'observation', label: 'Ghi chú' },
  { value: 'entry_date', label: 'Ngày ghi' },
] as const
const EDITABLE = ['DRAFT', 'PENDING_APPROVAL', 'REJECTED', 'REQUEST_CHANGES']

type JournalEditPayload = { entry_id: string; field: 'observation' | 'entry_date'; value: string }

const payloadSchema = z
  .object({ entry_id: z.string().min(1), field: z.enum(['observation', 'entry_date']), value: z.string().trim().min(1).max(2000) })
  .refine((p) => p.field !== 'entry_date' || parseVnDate(p.value) !== null, { message: 'Ngày không hợp lệ', path: ['value'] })

/** Routes: `PUT /api/journal/[id]`. The route stores only the note and the date of an entry, so only those are offered. */
export const journalEditAction: ChatAction<JournalEditPayload> = {
  name: 'journal.edit',
  titleVi: 'Sửa nhật ký',
  risk: 'medium',
  roles: ['farmer'],
  routes: ['PUT /api/journal/[id]'],
  args: [],
  steps: [
    { kind: 'choice', slot: 'entry_id', promptVi: 'Chọn nhật ký cần sửa:', choices: (user) => ownEntryChoices(user, EDITABLE) },
    { kind: 'choice', slot: 'field', promptVi: 'Sửa phần nào?', choices: async () => [...FIELDS] },
    { kind: 'text', slot: 'value', promptVi: 'Nhập nội dung mới (ngày dạng 25/11/2026):', maxLength: 2000 },
  ],
  payloadSchema,
  consequenceVi: null,
  async preview(payload, user) {
    const entry = await scopedEntry(user, payload.entry_id)
    const field = FIELDS.find((f) => f.value === payload.field)?.label ?? payload.field
    return [`Nhật ký: ${entryLabel(entry)}`, `Trường: ${field}`, `Giá trị mới: ${clip(payload.value)}`]
  },
  async execute(payload, user) {
    await scopedEntry(user, payload.entry_id)
    const data = payload.field === 'entry_date' ? { entry_date: parseVnDate(payload.value)! } : { observation: payload.value }
    await new UpdateJournalEntryUseCase(new PrismaJournalRepository()).execute(payload.entry_id, data, 'FARMER', user.householdId ?? undefined)
    return 'Đã cập nhật nhật ký.'
  },
}
