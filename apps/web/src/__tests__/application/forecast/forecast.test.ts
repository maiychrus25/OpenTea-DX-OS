// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ForecastUseCase } from '@/application/forecast/ForecastUseCase'
import type { ForecastSource } from '@/domain/forecast/ports/ForecastSource'

// Saturday 2026-11-28 in Vietnam; weeks start on Monday.
const row = (code: string, harvest_on: string, area_ha: number, history: number[]) => ({ parcel_id: code, parcel_code: code, harvest_on, area_ha, history })

function source(rows: ReturnType<typeof row>[], norm: number | null = null): ForecastSource {
  return { freshNorm: jest.fn(async () => norm), windowParcels: jest.fn(async () => rows) }
}
const read = (s: ForecastSource) => new ForecastUseCase(s).read('htx-1', '2026-11-28')

describe('ForecastUseCase', () => {
  it('asks for the window today to today + 14 days', async () => {
    const s = source([])
    await read(s)
    expect(s.windowParcels).toHaveBeenCalledWith('htx-1', '2026-11-28', '2026-12-12')
  })

  it('uses the median of the last three closed flushes and divides by 4.75 for dry', async () => {
    const view = await read(source([row('P1', '2026-11-30', 1, [300, 100, 200])]))
    expect(view.parcels).toEqual([{ parcel_id: 'P1', parcel_code: 'P1', harvest_on: '2026-11-30', fresh_kg: 200, dry_kg: 42.1, source: 'HISTORY' }])
    expect(view.total_fresh_kg).toBe(200)
    expect(view.total_dry_kg).toBe(42.1)
  })

  it('averages the two middle values when only two flushes exist, and takes only three', async () => {
    const two = await read(source([row('P1', '2026-11-30', 1, [100, 200])]))
    expect(two.parcels[0].fresh_kg).toBe(150)
    const four = await read(source([row('P1', '2026-11-30', 1, [10, 20, 30, 9999])]))
    expect(four.parcels[0].fresh_kg).toBe(20)
  })

  it('falls back to area times the norm with source NORM, default 1800', async () => {
    const view = await read(source([row('P2', '2026-12-01', 0.5, [])]))
    expect(view.parcels[0]).toMatchObject({ fresh_kg: 900, dry_kg: 189.5, source: 'NORM' })
  })

  it('takes the per-cooperative norm when the settings have one', async () => {
    const view = await read(source([row('P2', '2026-12-01', 0.5, [])], 2000))
    expect(view.parcels[0].fresh_kg).toBe(1000)
  })

  it('groups into Monday weeks in order, and totals add up to the rows shown', async () => {
    const view = await read(source([
      row('P3', '2026-12-09', 1, [95]), // Wed, week of 2026-12-07
      row('P1', '2026-11-28', 1, [100]), // Sat, week of 2026-11-23
      row('P2', '2026-11-30', 1, [100]), // Mon, week of 2026-11-30
      row('P4', '2026-11-29', 1, [10]), // Sun, week of 2026-11-23
    ]))
    expect(view.weeks).toEqual([
      { week_start: '2026-11-23', fresh_kg: 110, dry_kg: 23.2 },
      { week_start: '2026-11-30', fresh_kg: 100, dry_kg: 21.1 },
      { week_start: '2026-12-07', fresh_kg: 95, dry_kg: 20 },
    ])
    expect(view.parcels.map((p) => p.parcel_code)).toEqual(['P1', 'P4', 'P2', 'P3'])
    expect(view.total_fresh_kg).toBe(305)
    expect(view.total_dry_kg).toBe(64.3)
  })

  it('returns zeros and no rows for an empty window', async () => {
    expect(await read(source([]))).toEqual({ weeks: [], parcels: [], total_fresh_kg: 0, total_dry_kg: 0 })
  })
})
