// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { changePercent, weeklyKg } from '@/lib/manager/overview'

it('compares with the earlier figure only when there is one', () => {
  expect(changePercent(110, 100)).toBe(10)
  expect(changePercent(10, 0)).toBeNull()
  expect(changePercent(10, undefined)).toBeNull()
})

it('adds leaf into Monday weeks by Vietnam day, oldest first', () => {
  // Saturday 28/11/2026 in Vietnam; the current week starts Monday 23/11.
  const now = new Date('2026-11-28T03:00:00Z')
  const weeks = weeklyKg([
    { weighed_at: new Date('2026-11-22T18:00:00Z'), net_kg: 10.2 }, // already Monday 23/11 in Vietnam
    { weighed_at: new Date('2026-11-22T10:00:00Z'), net_kg: 5 },
    { weighed_at: new Date('2026-01-01T00:00:00Z'), net_kg: 99 },
  ], now, 2)
  expect(weeks).toEqual([{ label: '16/11', kg: 5 }, { label: '23/11', kg: 10.2 }])
})
