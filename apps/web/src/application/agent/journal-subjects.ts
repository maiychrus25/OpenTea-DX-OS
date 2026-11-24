// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { Proposal } from '@/domain/agent/proposal'
import { ACTIVITY_LABEL, formatVnDayMonth, type JournalSubject } from './actions/journal-labels'
import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository'

export function journalEntryIds(proposal: Proposal): string[] {
  if (!proposal.kind.startsWith('journal.')) return []
  return proposal.evidence?.rows?.filter((r) => r.table === 'journal_entries').map((r) => r.id) ?? []
}

/** One scoped query for every journal entry the listed proposals mention; foreign or deleted ids get no label. */
export async function loadJournalSubjects(
  proposals: Proposal[],
  htxProfileId: string
): Promise<Map<string, JournalSubject>> {
  const ids = Array.from(new Set(proposals.flatMap(journalEntryIds)))
  const entries = await new PrismaJournalRepository().findManyScoped(ids, htxProfileId)
  return new Map(
    entries.map((entry) => [
      entry.id,
      {
        id: entry.id,
        parcel: entry.parcel_code || entry.parcel_id,
        activity: ACTIVITY_LABEL[entry.activity_type] ?? entry.activity_type,
        day: formatVnDayMonth(entry.entry_date) ?? '',
      },
    ])
  )
}

