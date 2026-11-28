/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Runs against a throwaway Postgres with every migration applied, and only when FORECAST_TEST_DATABASE_URL is set:
//   FORECAST_TEST_DATABASE_URL=postgresql://... npx jest src/__tests__/db/forecast-postgres.integration.test.ts
// It never runs in the normal suite, which has no database.

export {}

const url = process.env.FORECAST_TEST_DATABASE_URL
const maybe = url ? describe : describe.skip

maybe('forecast on a real Postgres', () => {
  let prisma: import('@prisma/client').PrismaClient
  let useCase: import('@/application/forecast/ForecastUseCase').ForecastUseCase

  const run = String(Date.now())
  const TODAY = '2026-11-28'
  const ids = { htx: '', code: '', hh: '', grade: '', otherHtx: '', otherParcel: '' }

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    ;({ prisma } = require('@/infrastructure/db/prisma.client'))
    const { ForecastUseCase } = require('@/application/forecast/ForecastUseCase')
    const { PrismaForecastSource } = require('@/infrastructure/db/forecast/PrismaForecastSource')
    useCase = new ForecastUseCase(new PrismaForecastSource())
    const make = async (tag: string) => {
      const htx = await prisma.htxProfile.create({ data: { name: `HTX ${tag}`, address: 'x', crop_types: [], htx_code: `${tag}${run.slice(-5)}` } })
      const hh = await prisma.household.create({ data: { name: `Hộ ${tag}`, phone: `0${tag === 'F' ? 9 : 8}${run.slice(-8)}`, htx_profile_id: htx.id } })
      const grade = await prisma.leafGrade.create({ data: { htx_profile_id: htx.id, name: 'Búp', sort_order: 1 } })
      return { htx, hh, grade }
    }
    const a = await make('F')
    const b = await make('G')
    Object.assign(ids, { htx: a.htx.id, code: a.htx.htx_code, hh: a.hh.id, grade: a.grade.id, otherHtx: b.htx.id })
    const other = await prisma.parcel.create({ data: { parcel_code: `PG-${run}`, household_id: b.hh.id, crop_type: 'Chè', area_ha: 1, status: 'TENDING' } })
    ids.otherParcel = other.id
    await prisma.parcelCropCycle.create({ data: { parcel_id: other.id, estimated_harvest_date: new Date('2026-11-30T00:00:00Z') } })
  })

  afterAll(async () => { await prisma.$disconnect() })

  const parcel = (code: string, area: number) => prisma.parcel.create({ data: { parcel_code: `${code}-${run}`, household_id: ids.hh, crop_type: 'Chè', area_ha: area, status: 'TENDING' } })
  const closedFlush = async (parcelId: string, harvested: string, kg: string, extra: { voided?: boolean } = {}) => {
    const cycle = await prisma.parcelCropCycle.create({ data: { parcel_id: parcelId, harvested_at: new Date(harvested) } })
    await prisma.freshLeafTicket.create({ data: { htx_profile_id: ids.htx, ticket_no: `T-${cycle.id}`, household_id: ids.hh, parcel_id: parcelId, cycle_id: cycle.id, grade_id: ids.grade, weighed_at: new Date(harvested), gross_kg: kg, deduction_pct: '0', net_kg: kg, price_vnd_per_kg: 9000, amount_vnd: BigInt(1), status: extra.voided ? 'VOIDED' : 'VALID', created_by_id: 'u1' } })
  }

  it('forecasts one HTX: median of three closed flushes, norm for new parcels, window edges, no foreign parcels', async () => {
    const hist = await parcel('H', 2)
    await closedFlush(hist.id, '2026-04-01T00:00:00Z', '4000.0') // fourth newest, ignored
    await closedFlush(hist.id, '2026-05-01T00:00:00Z', '100.0')
    await closedFlush(hist.id, '2026-06-01T00:00:00Z', '300.0')
    await closedFlush(hist.id, '2026-07-01T00:00:00Z', '200.0')
    await closedFlush(hist.id, '2026-08-01T00:00:00Z', '4500.0', { voided: true }) // no valid ticket, not a flush with weight
    await prisma.parcelCropCycle.create({ data: { parcel_id: hist.id, estimated_harvest_date: new Date('2026-12-12T10:00:00Z') } }) // last day of the window (Vietnam 17:00)
    const fresh = await parcel('N', 0.5)
    await prisma.parcelCropCycle.create({ data: { parcel_id: fresh.id, estimated_harvest_date: new Date('2026-11-27T20:00:00Z') } }) // 2026-11-28 03:00 VN, today
    const early = await parcel('E', 1)
    await prisma.parcelCropCycle.create({ data: { parcel_id: early.id, estimated_harvest_date: new Date('2026-11-27T16:59:00Z') } }) // 2026-11-27 23:59 VN, yesterday
    const late = await parcel('L', 1)
    await prisma.parcelCropCycle.create({ data: { parcel_id: late.id, estimated_harvest_date: new Date('2026-12-12T17:00:00Z') } }) // 2026-12-13 00:00 VN, day 15
    const done = await parcel('D', 1)
    await prisma.parcelCropCycle.create({ data: { parcel_id: done.id, estimated_harvest_date: new Date('2026-12-01T00:00:00Z'), harvested_at: new Date('2026-12-01T00:00:00Z') } })

    const view = await useCase.read(ids.htx, TODAY)
    expect(view.parcels.map((p) => [p.parcel_code, p.harvest_on, p.fresh_kg, p.dry_kg, p.source])).toEqual([
      [`N-${run}`, '2026-11-28', 900, 189.5, 'NORM'],
      [`H-${run}`, '2026-12-12', 200, 42.1, 'HISTORY'],
    ])
    expect(view.total_fresh_kg).toBe(1100)
    expect(view.total_dry_kg).toBe(231.6)
    expect(view.weeks.map((w) => w.week_start)).toEqual(['2026-11-23', '2026-12-07'])
  })

  it('takes the norm from the cross-check settings of that cooperative', async () => {
    await prisma.$executeRaw`
      INSERT INTO platform.agent_settings (htx_code, agent, thresholds) VALUES (${ids.code}, 'cross-check', '{"fresh_norm_kg_per_ha_flush": 2000}'::jsonb)
      ON CONFLICT (htx_code, agent) DO UPDATE SET thresholds = EXCLUDED.thresholds`
    const view = await useCase.read(ids.htx, TODAY)
    expect(view.parcels.find((p) => p.source === 'NORM')?.fresh_kg).toBe(1000)
  })
})
