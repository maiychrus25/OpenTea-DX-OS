// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { localDay } from '@/domain/shared/local-day'
import { nextHarvestRoundSeason } from '@/domain/farm/harvest-round'
import { activeWithdrawals } from '@/domain/journal/active-withdrawals'

const DAY = 24 * 60 * 60 * 1000

describe('localDay', () => {
  test('uses the day in Vietnam, not in UTC', () => {
    expect(localDay(new Date('2026-12-31T17:00:00Z'))).toBe('2027-01-01')
    expect(localDay(new Date('2026-12-31T16:59:59Z'))).toBe('2026-12-31')
    expect(localDay('2026-11-10T00:00:00.000Z')).toBe('2026-11-10')
  })
})

describe('nextHarvestRoundSeason', () => {
  const now = new Date('2026-11-10T03:00:00Z')

  test('numbers the round after the cycles created in the same year', () => {
    const created = [new Date('2025-11-01T03:00:00Z'), new Date('2026-03-01T03:00:00Z'), new Date('2026-06-01T03:00:00Z')]
    expect(nextHarvestRoundSeason(created, now)).toBe('Lứa 3/2026')
  })

  test('starts at 1 when the parcel has no cycle this year', () => {
    expect(nextHarvestRoundSeason([], now)).toBe('Lứa 1/2026')
    expect(nextHarvestRoundSeason([new Date('2025-12-31T16:00:00Z')], now)).toBe('Lứa 1/2026')
  })

  test('counts by the year in Vietnam at the turn of the year', () => {
    const newYear = new Date('2026-12-31T18:00:00Z') // 01:00 on 1 January 2027 in Vietnam
    expect(nextHarvestRoundSeason([new Date('2026-12-31T17:30:00Z')], newYear)).toBe('Lứa 2/2027')
    expect(nextHarvestRoundSeason([new Date('2026-12-31T16:30:00Z')], newYear)).toBe('Lứa 1/2027')
  })
})

describe('activeWithdrawals', () => {
  const now = new Date('2026-11-10T03:00:00Z')

  test('takes the latest future safe date of each parcel and rounds the days up', () => {
    const rows = [
      { parcel_code: 'A3', safe_harvest_date: new Date(now.getTime() + 3 * DAY) },
      { parcel_code: 'A3', safe_harvest_date: new Date(now.getTime() + 5 * DAY + 60 * 60 * 1000) },
      { parcel_code: 'B1', safe_harvest_date: new Date(now.getTime() + DAY) },
    ]
    expect(activeWithdrawals(rows, now)).toEqual([
      { parcel_code: 'A3', days: 6 },
      { parcel_code: 'B1', days: 1 },
    ])
  })

  test('counts a part of a day as one day', () => {
    expect(activeWithdrawals([{ parcel_code: 'A3', safe_harvest_date: new Date(now.getTime() + 1) }], now)).toEqual([
      { parcel_code: 'A3', days: 1 },
    ])
    expect(activeWithdrawals([{ parcel_code: 'A3', safe_harvest_date: new Date(now.getTime() + DAY + 1) }], now)).toEqual([
      { parcel_code: 'A3', days: 2 },
    ])
  })

  test('returns nothing when no safe date is in the future', () => {
    const rows = [
      { parcel_code: 'A3', safe_harvest_date: now },
      { parcel_code: 'B1', safe_harvest_date: new Date(now.getTime() - DAY) },
    ]
    expect(activeWithdrawals(rows, now)).toEqual([])
  })
})
