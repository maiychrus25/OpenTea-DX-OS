/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { seasonFigures, type SeasonFigureSource } from '@/application/agent/strategy/season-figures'

function source(over: Partial<SeasonFigureSource> = {}): SeasonFigureSource {
  return {
    yieldKg: jest.fn(async () => 1200.04),
    journalCounts: jest.fn(async () => ({ total: 8, onTime: 6 })),
    parcelCounts: jest.fn(async () => ({ parcels: 20, diseased: 1 })),
    shopRevenue: jest.fn(async () => 5_000_000),
    ...over,
  }
}

describe('seasonFigures', () => {
  it('reads the four figures of a quarter, rates to one decimal', async () => {
    const reads = source()
    expect(await seasonFigures('TC', '2026-Q4', reads)).toEqual({
      yield_kg: 1200,
      journal_on_time_rate: 75,
      diseased_parcel_rate: 5,
      shop_revenue_vnd: 5_000_000,
    })
    expect(reads.yieldKg).toHaveBeenCalledWith('TC', new Date('2026-09-30T17:00:00.000Z'), new Date('2026-12-31T17:00:00.000Z'))
  })

  it('a figure with no rows is null, and a rate over no rows too', async () => {
    const figures = await seasonFigures(
      'TC',
      '2025-Q4',
      source({
        yieldKg: jest.fn(async () => null),
        journalCounts: jest.fn(async () => ({ total: 0, onTime: 0 })),
        parcelCounts: jest.fn(async () => ({ parcels: 0, diseased: 0 })),
        shopRevenue: jest.fn(async () => null),
      })
    )
    expect(figures).toEqual({ yield_kg: null, journal_on_time_rate: null, diseased_parcel_rate: null, shop_revenue_vnd: null })
  })

  it('keeps a real zero: parcels but no diseased ones is 0, not null', async () => {
    const figures = await seasonFigures('TC', '2026-Q4', source({ parcelCounts: jest.fn(async () => ({ parcels: 12, diseased: 0 })) }))
    expect(figures.diseased_parcel_rate).toBe(0)
  })
})
