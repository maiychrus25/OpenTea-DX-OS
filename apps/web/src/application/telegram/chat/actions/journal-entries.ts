// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ACTIVITY_LABEL, formatVnDayMonth } from '@/application/agent/actions/journal-labels'
import type { JournalEntryData } from '@/domain/journal/ports/JournalPort'
import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository'
import { householdFilter } from '../tools/common'
import type { ChatUser, Choice } from '../types'
import { MAX_CHOICES, notFound } from './scope'

const SCAN = 40

/** `25/11 · TC-A1 · Phun thuốc`: how a journal entry is named in a choice and on a card. */
export function entryLabel(entry: JournalEntryData): string {
  return `${formatVnDayMonth(entry.entry_date) ?? '—'} · ${entry.parcel_code ?? entry.parcel_id} · ${ACTIVITY_LABEL[entry.activity_type] ?? entry.activity_type}`
}

/** The farmer's own household entries in one of `statuses`, newest first, as choices. Nothing without a household. */
export async function ownEntryChoices(user: ChatUser, statuses: readonly string[]): Promise<Choice[]> {
  const scope = householdFilter(user)
  if (!scope?.household_id) return []
  const { entries } = await new PrismaJournalRepository().findAll({
    household_id: scope.household_id,
    htx_profile_id: user.tenant.htxProfileId,
    limit: SCAN,
  })
  return entries
    .filter((entry) => entry.household_id === scope.household_id && statuses.includes(entry.status))
    .slice(0, MAX_CHOICES)
    .map((entry) => ({ value: entry.id, label: entryLabel(entry) }))
}

/** An entry of the user's cooperative; for a farmer also of their household. Anything else is not found. */
export async function scopedEntry(user: ChatUser, id: string): Promise<JournalEntryData> {
  const [entry] = await new PrismaJournalRepository().findManyScoped([id], user.tenant.htxProfileId)
  if (!entry || (user.tenant.role === 'farmer' && entry.household_id !== user.householdId)) throw notFound()
  return entry
}
