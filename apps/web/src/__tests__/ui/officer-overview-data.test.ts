// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { approvalMetrics, dailyCounts, householdProgress, latestSafeDates, weeklyActivity, vietnamDayStart } from '@/components/features/officer-web/overview-data'

const now = new Date('2026-11-27T09:00:00Z')

describe('officer overview calculations', () => {
  it('uses Vietnam midnight including the UTC date boundary', () => {
    expect(vietnamDayStart(new Date('2026-11-26T18:00:00Z')).toISOString()).toBe('2026-11-26T17:00:00.000Z')
  })
  it('counts only dates in the last seven Vietnam calendar days, not future entries', () => {
    expect(dailyCounts([new Date('2026-11-26T18:00:00Z'), new Date('2026-11-27T10:00:00Z'), new Date('2026-10-01')], now)).toEqual([0, 0, 0, 0, 0, 0, 1])
  })
  it('uses the latest safe date for each parcel, independently', () => {
    const dates = latestSafeDates([
      { safe_harvest_date: new Date('2026-11-30'), journal_entry: { parcel_id: 'a' } },
      { safe_harvest_date: new Date('2026-11-28'), journal_entry: { parcel_id: 'a' } },
      { safe_harvest_date: null, journal_entry: { parcel_id: 'b' } },
    ])
    expect(dates.get('a')?.toISOString()).toBe('2026-11-30T00:00:00.000Z')
    expect(dates.has('b')).toBe(false)
  })
  it('measures parcel coverage, not number of entries or inactive parcels', () => {
    expect(householdProgress([
      { status: 'TENDING', journal_entries: [{}] },
      { status: 'SOWING', journal_entries: [] },
      { status: 'DRAFT', journal_entries: [{}] },
      { status: 'HARVESTED', journal_entries: [{}] },
    ])).toEqual({ active: 2, recorded: 1, percent: 50 })
    expect(householdProgress([])).toEqual({ active: 0, recorded: 0, percent: null })
  })
  it('counts each journal once in a non-overlapping week and preserves all activity types', () => {
    const weeks = weeklyActivity([
      { entry_date: new Date('2026-10-28T17:00:00Z'), activity_type: 'SPRAYING' },
      { entry_date: new Date('2026-11-04T17:00:00Z'), activity_type: 'FERTILIZING' },
      { entry_date: now, activity_type: 'SOWING' },
      { entry_date: new Date('2026-10-28T16:59:59Z'), activity_type: 'HARVEST' },
      { entry_date: new Date('2026-11-28'), activity_type: 'OTHER' },
    ], now)
    expect(weeks).toHaveLength(5)
    expect(weeks.map(w => w.total)).toEqual([1, 1, 0, 0, 1])
    expect(weeks[4].counts.SOWING).toBe(1)
    expect(weeks[4].label).toBe('26/11–27/11')
  })
  it('omits unavailable approval metrics and defines 48 hours inclusively', () => {
    expect(approvalMetrics([])).toBeNull()
    expect(approvalMetrics([{ created_at: now, approved_at: null }])).toBeNull()
    expect(approvalMetrics([
      { created_at: new Date('2026-11-25T09:00:00Z'), approved_at: now },
      { created_at: new Date('2026-11-24T09:00:00Z'), approved_at: now },
    ])).toEqual({ rate: 50, averageDays: 2.5, count: 2 })
  })
})
