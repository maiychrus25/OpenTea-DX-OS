// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { canonicalJson, sha256Hex } from '@/domain/agent/evidence'
import type { Evidence, EvidenceRow } from '@/domain/agent/proposal'
import type { JournalEntryData, JournalPort } from '@/domain/journal/ports/JournalPort'

export function journalEntryEvidence(entry: JournalEntryData): EvidenceRow {
  const entryDate =
    entry.entry_date instanceof Date ? entry.entry_date.toISOString() : new Date(entry.entry_date).toISOString()
  const activities = [...entry.activities]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((a) => ({
      id: a.id,
      product_name: a.product_name ?? null,
      dosage: a.dosage ?? null,
      withdrawal_days: a.withdrawal_days ?? null,
    }))

  const values: Record<string, unknown> = {
    status: entry.status,
    entry_date: entryDate,
    activity_type: entry.activity_type,
    activities,
  }
  return {
    table: 'journal_entries',
    id: entry.id,
    sha256: sha256Hex(canonicalJson(values)),
    values,
  }
}

export async function isJournalEntriesStale(
  entryIds: readonly string[],
  evidence: Evidence,
  journalRepo: Pick<JournalPort, 'findById'>
): Promise<boolean> {
  for (const id of entryIds) {
    const expected = evidence.rows.find((r) => r.table === 'journal_entries' && r.id === id)
    if (!expected) return true
    const currentEntry = await journalRepo.findById(id)
    if (!currentEntry) return true
    const current = journalEntryEvidence(currentEntry)
    if (current.sha256 !== expected.sha256) return true
  }
  return false
}
