// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { countsTowardWithdrawal } from './withdrawal-status'

/** The part of a journal entry the withdrawal rules read. Drafts and rejected entries never count. */
export interface SprayEntry {
  status: string
  entry_date: Date | string
  cycle_id?: string | null
  activities: { safe_harvest_date: Date | string | null }[]
}

function latest(entries: SprayEntry[], keep: (entryDate: Date, safeDate: Date) => boolean): Date | null {
  let result: Date | null = null
  for (const entry of entries) {
    if (!countsTowardWithdrawal(entry.status)) continue
    const entryDate = new Date(entry.entry_date)
    for (const activity of entry.activities) {
      if (!activity.safe_harvest_date) continue
      const safeDate = new Date(activity.safe_harvest_date)
      if (keep(entryDate, safeDate) && (!result || safeDate > result)) result = safeDate
    }
  }
  return result
}

/**
 * Rule (a), a parcel with an open flush checked on `asOf`: residue stays in the plant whatever the flush, so every
 * spraying of the parcel done by `asOf` whose safe date is still after `asOf` blocks. Null when nothing blocks.
 */
export function openParcelBlock(entries: SprayEntry[], asOf: Date): Date | null {
  return latest(entries, (entryDate, safeDate) => entryDate <= asOf && safeDate > asOf)
}

/**
 * Rule (b), a harvested flush or lot with harvest date `harvestDate`: a spraying counts when its safe date is after
 * the harvest date and it belongs to the lot line's flush or was done by the harvest date. A spray of the next flush
 * done later does not lock the old lot. A null `cycle_id` (legacy) is covered by the date clause.
 */
export function lotLineBlock(entries: SprayEntry[], harvestDate: Date, lineCycleId: string | null): Date | null {
  return latest(entries.filter((e) => belongsToLotLine(e, harvestDate, lineCycleId)), (_entryDate, safeDate) => safeDate > harvestDate)
}

/** True when the entry counts for the lot line: of its flush, or done by the harvest date. */
export function belongsToLotLine(entry: Pick<SprayEntry, 'cycle_id' | 'entry_date'>, harvestDate: Date, lineCycleId: string | null): boolean {
  return (!!lineCycleId && entry.cycle_id === lineCycleId) || new Date(entry.entry_date) <= harvestDate
}
