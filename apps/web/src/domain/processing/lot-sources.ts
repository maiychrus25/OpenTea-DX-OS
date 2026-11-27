// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { lotLineBlock, type SprayEntry } from '@/domain/journal/blocking-sprays'
import { endOfVnDay } from '@/application/weighing/withdrawal-gate'
import { vnDayOf } from '@/application/agent/campaign/vn-day'

/**
 * The safe Vietnam day (`YYYY-MM-DD`) that keeps a weighed ticket out of a lot, or null when it may go in.
 * Rule (b) of S1 with the harvest moment at the end of the weigh day, as the weighing gate counts it: a spraying
 * whose safe day is the weigh day itself does not block, and one recorded later with an earlier entry date does.
 */
export function ticketBlock(entries: SprayEntry[], weighedOn: string, cycleId: string | null): string | null {
  const safe = lotLineBlock(entries, endOfVnDay(weighedOn), cycleId)
  return safe ? vnDayOf(safe) : null
}

/** A ticket that feeds a lot, through the batch its dry tea came from. */
export interface SourceTicket {
  id: string
  parcel_id: string
  parcel_code: string
  cycle_id: string | null
  weighed_at: Date
  net_kg: string
}
