/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Fake Prisma: a row is found only when its id matches and the cooperative filter in the query (if any) names its HTX.
jest.mock('@/infrastructure/db/prisma.client', () => {
  function htxFilter(where: unknown): string | undefined {
    if (!where || typeof where !== 'object') return undefined
    for (const [key, value] of Object.entries(where as Record<string, unknown>)) {
      if (key === 'htx_code' && typeof value === 'object' && value !== null) return (value as { equals?: string; _eq?: string }).equals
      if (key === 'htx_code' && typeof value === 'string') return value
      const nested = htxFilter(value)
      if (nested !== undefined) return nested
    }
    return undefined
  }
  const parcelRow = {
    id: 'cmpaLB_1',
    parcel_code: 'P-LB-001',
    status: 'TENDING',
    harvest_approved_at: null,
    updated_at: new Date('2026-11-24T09:15:30.500Z'),
    htx: 'LB',
  }
  const diseaseRow = {
    id: 'cmdrLB_1',
    parcel_id: 'cmpaLB_1',
    status: 'PENDING',
    detection_date: new Date('2026-11-23T03:20:00.000Z'),
    ai_disease_name: 'helopeltis',
    confirmed_diagnosis: null,
    updated_at: new Date('2026-11-23T03:20:01.700Z'),
    htx: 'LB',
  }
  const weatherRow = {
    id: '6f1d0c9e-0000-4000-8000-00000000c001',
    parcel_id: 'cmpaLB_1',
    recorded_at: new Date('2026-11-24T08:00:00.000Z'),
    precipitation_mm: 1.2,
    forecast_json: null,
    htx: 'LB',
  }
  const sensorRow = {
    parcel_code: 'P-LB-001',
    sensor: 'soil_moisture',
    ts: new Date('2026-11-24T02:00:00.000Z'),
    value: 20.5,
    htx_code: 'LB',
  }
  const marketRow = {
    id: '0b4e9f8a-0000-4000-8000-0000000000c1',
    source: 'FAOSTAT',
    commodity: 'Tea',
    metric: 'export_price',
    value: 2.35,
    unit: 'USD/kg',
    period: '2026-10',
    fetched_at: new Date('2026-11-24T21:00:05.004Z'),
  }
  const findOne = (rows: Record<string, unknown>[]) => async (args: { where: Record<string, unknown> }) => {
    const htx = htxFilter(args.where)
    return rows.find((r) => r.id === args.where.id && (htx === undefined || htx === r.htx)) ?? null
  }
  const prisma = {
    parcel: { findFirst: findOne([parcelRow]) },
    diseaseReport: { findFirst: findOne([diseaseRow]) },
    weatherCache: { findFirst: findOne([weatherRow]) },
    marketData: { findUnique: findOne([marketRow]) },
    // Raw SQL: the cooperative code is the first bound value, so a row is returned only when it is among them.
    $queryRaw: async (_strings: TemplateStringsArray, ...values: unknown[]) =>
      values.includes(sensorRow.htx_code) ? [sensorRow] : [],
  }
  return { prisma }
})

import { EVIDENCE_LOADERS } from '@/application/agent/actions/journal-evidence'

const LB_PARCEL_ID = 'cmpaLB_1'

describe('evidence loaders are scoped to the cooperative (C2)', () => {
  test('parcels: a parcel of another cooperative reads as missing', async () => {
    await expect(EVIDENCE_LOADERS.parcels('TC', LB_PARCEL_ID)).resolves.toBeNull()
    await expect(EVIDENCE_LOADERS.parcels('LB', LB_PARCEL_ID)).resolves.toMatchObject({ parcel_code: 'P-LB-001' })
  })

  test('disease_reports: a report of another cooperative reads as missing', async () => {
    await expect(EVIDENCE_LOADERS.disease_reports('TC', 'cmdrLB_1')).resolves.toBeNull()
    await expect(EVIDENCE_LOADERS.disease_reports('LB', 'cmdrLB_1')).resolves.toMatchObject({ parcel_id: LB_PARCEL_ID })
  })

  test('weather_cache: a weather row of another cooperative reads as missing', async () => {
    const id = '6f1d0c9e-0000-4000-8000-00000000c001'
    await expect(EVIDENCE_LOADERS.weather_cache('TC', id)).resolves.toBeNull()
    await expect(EVIDENCE_LOADERS.weather_cache('LB', id)).resolves.toMatchObject({ precipitation_milli: 1200 })
  })

  test('sensor_readings: a reading of another cooperative reads as missing', async () => {
    const id = 'P-LB-001|soil_moisture|2026-11-24T02:00:00.000Z'
    await expect(EVIDENCE_LOADERS.sensor_readings('TC', id)).resolves.toBeNull()
    await expect(EVIDENCE_LOADERS.sensor_readings('LB', id)).resolves.toMatchObject({ value_milli: 20500 })
  })

  test('sensor_readings: a malformed id reads as missing', async () => {
    await expect(EVIDENCE_LOADERS.sensor_readings('LB', 'P-LB-001|soil_moisture')).resolves.toBeNull()
  })

  test('market_data: a non-uuid id reads as missing instead of failing the query', async () => {
    await expect(EVIDENCE_LOADERS.market_data('TC', 'not-a-uuid')).resolves.toBeNull()
  })

  test('market_data is shared: any cooperative reads the row', async () => {
    const id = '0b4e9f8a-0000-4000-8000-0000000000c1'
    await expect(EVIDENCE_LOADERS.market_data('TC', id)).resolves.toMatchObject({ value_milli: 2350 })
    await expect(EVIDENCE_LOADERS.market_data('LB', id)).resolves.toMatchObject({ value_milli: 2350 })
  })
})
