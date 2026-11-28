// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { vnDayStart } from '@/application/agent/campaign/vn-day'

const DAY_MS = 24 * 60 * 60 * 1000

/** Percent against the earlier figure; null when there is nothing to compare with. */
export function changePercent(now: number, before: number | undefined): number | null {
  if (!before) return null
  return Math.round(((now - before) / before) * 1000) / 10
}

export interface WeekKg { label: string; kg: number }

/** The Vietnam day, as YYYY-MM-DD. */
export const vnDay = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })

/** Where the first of the last `count` Monday-to-Sunday weeks starts. */
export function weeksStart(now: Date, count: number): Date {
  const today = vnDayStart(vnDay(now))
  const sinceMonday = (new Date(`${vnDay(now)}T00:00:00Z`).getUTCDay() + 6) % 7
  return new Date(today.getTime() - (sinceMonday + (count - 1) * 7) * DAY_MS)
}

/** Net leaf per week, oldest first; each week is labelled with the day it starts. */
export function weeklyKg(tickets: { weighed_at: Date; net_kg: number }[], now: Date, count = 8): WeekKg[] {
  const start = weeksStart(now, count).getTime()
  const weeks = Array.from({ length: count }, (_, i) => ({
    label: vnDay(new Date(start + i * 7 * DAY_MS)).slice(5).split('-').reverse().join('/'),
    kg: 0,
  }))
  for (const ticket of tickets) {
    const at = Math.floor((ticket.weighed_at.getTime() - start) / (7 * DAY_MS))
    if (at >= 0 && at < count) weeks[at].kg = Math.round((weeks[at].kg + ticket.net_kg) * 10) / 10
  }
  return weeks
}
