// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { createHash } from 'node:crypto'

/** Dedupe key of a price message: the cooperative, the day and a hash of the sorted `grade:price` pairs. */
export function priceEventId(htxCode: string, day: string, prices: { grade_id: string; price_vnd_per_kg: number }[]): string {
  const canonical = prices.map((p) => `${p.grade_id}:${p.price_vnd_per_kg}`).sort().join('|')
  return `${htxCode}:${day}:${createHash('sha256').update(canonical).digest('hex')}`
}
