// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

const dayInVietnam = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' })

/** The calendar day of an instant in the app's local time, as `YYYY-MM-DD`; these strings sort in date order. */
export function localDay(at: Date | string): string {
  return dayInVietnam.format(new Date(at))
}
