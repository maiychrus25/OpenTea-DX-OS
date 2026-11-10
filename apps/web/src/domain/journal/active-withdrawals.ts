// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Parcels still inside a withdrawal period, with the whole days left until their latest safe harvest date.
 * A part of a day counts as a day, so the farmer is never told the period is over too early.
 */
export function activeWithdrawals(
  rows: { parcel_code: string; safe_harvest_date: Date }[],
  now: Date,
): { parcel_code: string; days: number }[] {
  const latest = new Map<string, Date>()
  for (const { parcel_code, safe_harvest_date } of rows) {
    if (safe_harvest_date <= now) continue
    const seen = latest.get(parcel_code)
    if (!seen || safe_harvest_date > seen) latest.set(parcel_code, safe_harvest_date)
  }
  return Array.from(latest, ([parcel_code, at]) => ({ parcel_code, days: Math.ceil((at.getTime() - now.getTime()) / DAY_MS) }))
    .sort((a, b) => a.parcel_code.localeCompare(b.parcel_code))
}
