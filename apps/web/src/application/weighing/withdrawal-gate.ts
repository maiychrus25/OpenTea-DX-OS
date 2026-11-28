// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { openParcelBlock, type SprayEntry } from '@/domain/journal/blocking-sprays'
import { vnDayOf, vnDayStart } from '@/application/agent/campaign/vn-day'

const DAY_MS = 24 * 60 * 60 * 1000

/** The last moment of a Vietnam calendar day. */
export function endOfVnDay(day: string): Date {
  return new Date(vnDayStart(day).getTime() + DAY_MS - 1)
}

/**
 * The latest safe date (a Vietnam day, `YYYY-MM-DD`) of the sprays that block weighing on `day`, or null.
 * Rule (a) of S1 with `asOf` at the end of the day: a spraying done by that day whose safe day is after it blocks,
 * and the safe day itself is open. Flush, parcel status and who sprayed do not matter.
 */
export function weighingBlock(entries: SprayEntry[], day: string): string | null {
  const safeDate = openParcelBlock(entries, endOfVnDay(day))
  return safeDate ? vnDayOf(safeDate) : null
}

export const viDate = (day: string) => day.split('-').reverse().join('/')
