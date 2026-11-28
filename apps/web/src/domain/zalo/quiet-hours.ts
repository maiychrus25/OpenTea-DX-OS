// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { ZaloEventKind } from './zalo-events'

const VN_OFFSET_MS = 7 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
/** These two may go an hour before the quiet window ends: the farmer wants them before the day's work. */
const EARLY_KINDS: ZaloEventKind[] = ['PRICE_PUBLISHED', 'WITHDRAWAL_ENDED']

export interface QuietHours {
  quietStartHour: number
  quietEndHour: number
}

/**
 * When a message queued at `now` may be sent. Quiet hours run from the start hour to the end hour Vietnam time
 * (21:00-06:00 by default); inside them the time moves to the end. Vietnam has no daylight saving, so a fixed +7 is exact.
 */
export function deliveryTime(now: Date, kind: ZaloEventKind, quiet: QuietHours): Date {
  const endHour = EARLY_KINDS.includes(kind) ? quiet.quietEndHour - 1 : quiet.quietEndHour
  const local = now.getTime() + VN_OFFSET_MS
  const hour = (((local % DAY_MS) + DAY_MS) % DAY_MS) / HOUR_MS
  const quietNow = quiet.quietStartHour > endHour ? hour >= quiet.quietStartHour || hour < endHour : hour >= quiet.quietStartHour && hour < endHour
  if (!quietNow) return now
  const midnightLocal = local - (((local % DAY_MS) + DAY_MS) % DAY_MS)
  const sameDay = hour < endHour
  return new Date(midnightLocal + (sameDay ? 0 : DAY_MS) + endHour * HOUR_MS - VN_OFFSET_MS)
}
