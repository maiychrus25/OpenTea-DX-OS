// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { localDay } from '@/domain/shared/local-day'

/** `Lứa <n>/<year>`: n is one more than the cycles of the parcel created in the same local year. */
export function nextHarvestRoundSeason(cycleCreatedAts: Date[], now: Date): string {
  const year = localDay(now).slice(0, 4)
  const sameYear = cycleCreatedAts.filter((at) => localDay(at).startsWith(year)).length
  return `Lứa ${sameYear + 1}/${year}`
}
