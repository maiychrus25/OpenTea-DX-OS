// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** Vietnam has no daylight saving time, so a fixed +07:00 offset is exact. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000
export const BUDGET_WARN_RATIO = 0.8

export type BudgetLevel = 'none' | 'ok' | 'warn' | 'exhausted'

/** The Vietnam calendar month of `now`, as `YYYY-MM`. */
export function vnMonth(now: Date): string {
  const local = new Date(now.getTime() + VN_OFFSET_MS)
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}`
}

/** [start, end) of a `YYYY-MM` month in Vietnam time, as instants. */
export function vnMonthBounds(month: string): { start: Date; end: Date } {
  const [year, monthIndex] = month.split('-').map(Number)
  return {
    start: new Date(Date.UTC(year, monthIndex - 1, 1) - VN_OFFSET_MS),
    end: new Date(Date.UTC(year, monthIndex, 1) - VN_OFFSET_MS),
  }
}

/** `none` when the cooperative has no budget; `warn` from 80%; `exhausted` from 100%. */
export function budgetLevel(limit: number | null, spent: number): BudgetLevel {
  if (limit === null) return 'none'
  if (spent >= limit) return 'exhausted'
  if (spent >= limit * BUDGET_WARN_RATIO) return 'warn'
  return 'ok'
}
