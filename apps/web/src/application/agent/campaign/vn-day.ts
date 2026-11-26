// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

const VN_TIMEZONE = 'Asia/Ho_Chi_Minh'

/** Midnight of a `YYYY-MM-DD` Vietnam calendar day. */
export function vnDayStart(day: string): Date {
  return new Date(`${day}T00:00:00+07:00`)
}

/** The Vietnam calendar day of an instant, `YYYY-MM-DD`. */
export function vnDayOf(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: VN_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant)
}

/** Whether a `YYYY-MM-DD` string is a real calendar day (2026-02-31 is not). */
export function isRealDay(day: string): boolean {
  const parsed = new Date(`${day}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(day)
}
