// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { RECOVERY_BAND } from './grades'

const tenths = (kg: string) => Math.round(Number(kg) * 10)

/** Fresh and dry totals of a batch in whole tenths of a kg, and the fresh/dry ratio rounded half up to 2 decimals. */
export function batchTotals(ticketNetKg: string[], outputKg: string[]): { freshKg: number; dryKg: number; ratio: number | null; outOfBand: boolean } {
  const fresh = ticketNetKg.reduce((sum, kg) => sum + tenths(kg), 0)
  const dry = outputKg.reduce((sum, kg) => sum + tenths(kg), 0)
  // Hundredths of the ratio = fresh * 100 / dry, rounded half up in integers.
  const ratio = dry > 0 ? Math.floor((fresh * 200 + dry) / (2 * dry)) / 100 : null
  const outOfBand = ratio !== null && (ratio < RECOVERY_BAND.min || ratio > RECOVERY_BAND.max)
  return { freshKg: fresh / 10, dryKg: dry / 10, ratio, outOfBand }
}

/** `{HTX}-MS-YYYYMMDD-NN` for the n-th batch of the HTX on that processing day. */
export function batchCode(htxCode: string, day: string, n: number): string {
  return `${htxCode}-MS-${day.replace(/-/g, '')}-${String(n).padStart(2, '0')}`
}
