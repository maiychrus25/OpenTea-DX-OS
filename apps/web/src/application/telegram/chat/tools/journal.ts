// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ACTIVITY_LABEL, JOURNAL_STATUS_LABEL, formatVnDayMonth } from '@/application/agent/actions/journal-labels'
import type { JournalEntryData, JournalFilters } from '@/domain/journal/ports/JournalPort'
import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository'
import type { ChatTool, ChatUser } from '../types'
import { householdFilter, reply } from './common'

/** Count of entries matching the filters, as `GET /api/journal` would list them; the page size is one. */
export async function countJournal(user: ChatUser, filters: JournalFilters): Promise<number> {
  const { total } = await new PrismaJournalRepository().findAll({ ...filters, htx_profile_id: user.tenant.htxProfileId, limit: 1 })
  return total
}

function journalLine(entry: JournalEntryData): string {
  const day = formatVnDayMonth(entry.entry_date) ?? '—'
  const activity = ACTIVITY_LABEL[entry.activity_type] ?? entry.activity_type
  const status = JOURNAL_STATUS_LABEL[entry.status] ?? entry.status
  return `${day} · ${entry.parcel_code ?? entry.parcel_id} · ${activity} · ${status}`
}

/** Routes: `GET /api/journal`; a farmer's rows are filtered to their household again, as a guard. */
export const journalTool: ChatTool = {
  name: 'journal',
  titleVi: 'Nhật ký',
  roles: ['farmer', 'officer', 'manager'],
  routes: ['GET /api/journal'],
  args: [],
  async run(user) {
    const scope = householdFilter(user)
    if (!scope) return reply('Nhật ký', [])
    const { entries } = await new PrismaJournalRepository().findAll({ ...scope, htx_profile_id: user.tenant.htxProfileId, limit: 5 })
    const rows = scope.household_id ? entries.filter((entry) => entry.household_id === scope.household_id) : entries
    return reply('Nhật ký', rows.map(journalLine))
  },
}
