/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'
import type { CoreGatewayClient } from '@/infrastructure/core/core-gateway.client'
import { GatewayParcelReader } from '@/infrastructure/core/gateway-parcel-reader'
import { GatewayHouseholdReader } from '@/infrastructure/core/gateway-household-reader'
import { GatewayLotReader } from '@/infrastructure/core/gateway-lot-reader'
import { GatewayJournalReader } from '@/infrastructure/core/gateway-journal-reader'
import { GatewayDiseaseReportReader } from '@/infrastructure/core/gateway-disease-report-reader'
import { PrismaParcelRepository } from '@/infrastructure/db/farm/PrismaParcelRepository'
import { PrismaHouseholdRepository } from '@/infrastructure/db/farm/PrismaHouseholdRepository'
import { PrismaLotRepository } from '@/infrastructure/db/lot/PrismaLotRepository'
import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository'
import { PrismaDiseaseReportRepository } from '@/infrastructure/db/farm/PrismaDiseaseReportRepository'

jest.mock('@/lib/auth/core-token', () => ({ getCoreToken: jest.fn() }))
jest.mock('@/lib/sse-emitter', () => ({ sseEmitter: { emit: jest.fn() }, SSE_EVENTS: {} }))
jest.mock('@/infrastructure/db/prisma.client', () => ({
  prisma: {
    parcel: { findMany: jest.fn(), findUnique: jest.fn() },
    household: { findMany: jest.fn(), findUnique: jest.fn() },
    lot: { findMany: jest.fn(), findUnique: jest.fn() },
    journalEntry: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
    diseaseReport: { findMany: jest.fn() },
  },
}))

const mock = (fn: unknown) => fn as jest.Mock
const at = new Date('2026-07-20T01:02:03.456Z')

const parcelRow = {
  id: 'p1',
  parcel_code: 'P-1',
  household_id: 'h1',
  crop_type: 'Chè',
  area_ha: 1.5,
  centroid_lat: 21.5,
  centroid_lng: 105.8,
  polygon_geojson: { type: 'Polygon', coordinates: [[[1, 2]]] },
  status: 'TENDING',
  household: { id: 'h1', name: 'Hộ A', keycloak_user_id: 'kc1' },
  crop_cycles: [{ season: 'Vụ Xuân', sowed_at: at, harvested_at: null }],
}
const householdRow = {
  id: 'h1',
  name: 'Hộ A',
  phone: '0901',
  address: 'Xã A',
  keycloak_user_id: 'kc1',
  parcels: [{ area_ha: 1.5 }, { area_ha: 2 }],
}
const lotRow = {
  id: 'l1',
  lot_code: 'TC-CHE-1',
  commodity: 'Chè',
  harvest_date: at,
  estimated_weight_kg: 100,
  actual_weight_kg: null,
  status: 'READY',
  created_at: at,
  lot_parcels: [{ id: 'lp1' }, { id: 'lp2' }],
}
const journalRow = {
  id: 'j1',
  parcel_id: 'p1',
  entry_date: at,
  activity_type: 'SPRAYING',
  performed_by: 'An',
  submitted_by_id: 'kc1',
  submitted_role: 'FARMER',
  status: 'APPROVED',
  approved_by_id: 'kc2',
  approved_at: at,
  notes: 'ghi chú',
  weather_temperature: 27.5,
  weather_precipitation: 0,
  weather_humidity: 80,
  weather_condition: 'Nắng',
  photo_url: 'http://x/y.jpg',
  photo_minio_key: 'y.jpg',
  created_at: at,
  activities: [
    { id: 'a1', activity_detail: 'Phun', product_name: 'X', dosage: '2l', withdrawal_days: 7, safe_harvest_date: at },
    { id: 'a2', activity_detail: 'Tưới', product_name: null, dosage: null, withdrawal_days: null, safe_harvest_date: null },
  ],
  parcel: { household_id: 'h1', parcel_code: 'P-1', household: { keycloak_user_id: 'kc1' } },
}
const pendingReportRow = {
  id: 'd1',
  detection_date: at,
  photo_minio_key: 'k1',
  ai_disease_name: 'Rầy',
  ai_confidence: 0.91,
  photo_url: 'http://x/k1',
  parcel: { parcel_code: 'P-1' },
  household: { name: 'Hộ A' },
}
const historyReportRow = {
  id: 'd1',
  detection_date: at,
  photo_minio_key: 'k1',
  ai_disease_name: 'Rầy',
  ai_confidence: 0.91,
  status: 'CONFIRMED',
  treatment_recommendation: 'Phun thuốc',
  parcel: { parcel_code: 'P-1' },
}

// What Hasura sends for the same row: JSON, and `timestamp` columns with no zone.
const asCoreRow = <T>(row: T): T =>
  JSON.parse(JSON.stringify(row), (_key, value) =>
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.*Z$/.test(value) ? value.slice(0, -1) : value
  )

function fakeCore(data: unknown) {
  const graphql = jest.fn().mockResolvedValue(data)
  return { client: { graphql } as unknown as CoreGatewayClient, graphql }
}

type Case = {
  coreData: (row: never) => unknown
  read: (client: CoreGatewayClient) => Promise<unknown>
  readPrisma: () => Promise<unknown>
  prismaFn: () => jest.Mock
  many: boolean
  row: unknown
  empty: unknown
  expectedForEmpty: unknown
}

const journalEmpty = { ...journalRow, parcel: null, activities: [], approved_at: null, notes: null }
const journalEmptyExpected = expect.objectContaining({
  household_id: undefined,
  parcel_code: undefined,
  household_keycloak_user_id: undefined,
  approved_at: null,
  activities: [],
})
const journalAggregate = (total: number) => ({ journal_entries_aggregate: { aggregate: { count: total } } })

const cases: [string, Case][] = [
  [
    'GatewayParcelReader.findAll',
    {
      coreData: (row) => ({ parcels: [row] }),
      read: (c) => new GatewayParcelReader(c).findAll({}),
      readPrisma: () => new PrismaParcelRepository().findAll({}),
      prismaFn: () => mock(prisma.parcel.findMany),
      many: true,
      row: parcelRow,
      empty: { ...parcelRow, household: null, crop_cycles: [], centroid_lat: null, polygon_geojson: null },
      expectedForEmpty: [expect.objectContaining({ household: null, season: null, sowed_at: null, harvested_at: null, centroid_lat: null })],
    },
  ],
  [
    'GatewayParcelReader.findById',
    {
      coreData: (row) => ({ parcels_by_pk: row }),
      read: (c) => new GatewayParcelReader(c).findById('p1'),
      readPrisma: () => new PrismaParcelRepository().findById('p1'),
      prismaFn: () => mock(prisma.parcel.findUnique),
      many: false,
      row: parcelRow,
      empty: { ...parcelRow, household: null, crop_cycles: [] },
      expectedForEmpty: expect.objectContaining({ household: null, season: null, sowed_at: null, harvested_at: null }),
    },
  ],
  [
    'GatewayHouseholdReader.findAll',
    {
      coreData: (row) => ({ households: [row] }),
      read: (c) => new GatewayHouseholdReader(c).findAll('ignored'),
      readPrisma: () => new PrismaHouseholdRepository().findAll('ignored'),
      prismaFn: () => mock(prisma.household.findMany),
      many: true,
      row: householdRow,
      empty: { ...householdRow, address: null, keycloak_user_id: null, parcels: [] },
      expectedForEmpty: [expect.objectContaining({ address: null, keycloak_user_id: null, parcel_count: 0, total_area_ha: 0 })],
    },
  ],
  [
    'GatewayHouseholdReader.findById',
    {
      coreData: (row) => ({ households_by_pk: row }),
      read: (c) => new GatewayHouseholdReader(c).findById('h1'),
      readPrisma: () => new PrismaHouseholdRepository().findById('h1'),
      prismaFn: () => mock(prisma.household.findUnique),
      many: false,
      row: householdRow,
      empty: { ...householdRow, parcels: [] },
      expectedForEmpty: expect.objectContaining({ parcel_count: 0, total_area_ha: 0 }),
    },
  ],
  [
    'GatewayLotReader.findAll',
    {
      coreData: (row) => ({ lots: [row] }),
      read: (c) => new GatewayLotReader(c).findAll({}),
      readPrisma: () => new PrismaLotRepository().findAll({}),
      prismaFn: () => mock(prisma.lot.findMany),
      many: true,
      row: lotRow,
      empty: { ...lotRow, estimated_weight_kg: null, lot_parcels: [] },
      expectedForEmpty: [expect.objectContaining({ estimated_weight_kg: null, actual_weight_kg: null, parcel_count: 0 })],
    },
  ],
  [
    'GatewayLotReader.findById',
    {
      coreData: (row) => ({ lots_by_pk: row }),
      read: (c) => new GatewayLotReader(c).findById('l1'),
      readPrisma: () => new PrismaLotRepository().findById('l1'),
      prismaFn: () => mock(prisma.lot.findUnique),
      many: false,
      row: lotRow,
      empty: { ...lotRow, lot_parcels: [] },
      expectedForEmpty: expect.objectContaining({ parcel_count: 0 }),
    },
  ],
  [
    'GatewayJournalReader.findAll',
    {
      coreData: (row) => ({ journal_entries: [row], ...journalAggregate(1) }),
      read: (c) => new GatewayJournalReader(c).findAll({}),
      readPrisma: () => {
        mock(prisma.journalEntry.count).mockResolvedValue(1)
        return new PrismaJournalRepository().findAll({})
      },
      prismaFn: () => mock(prisma.journalEntry.findMany),
      many: true,
      row: journalRow,
      empty: journalEmpty,
      expectedForEmpty: { entries: [journalEmptyExpected], total: 1 },
    },
  ],
  [
    'GatewayJournalReader.findById',
    {
      coreData: (row) => ({ journal_entries_by_pk: row }),
      read: (c) => new GatewayJournalReader(c).findById('j1'),
      readPrisma: () => new PrismaJournalRepository().findById('j1'),
      prismaFn: () => mock(prisma.journalEntry.findUnique),
      many: false,
      row: journalRow,
      empty: journalEmpty,
      expectedForEmpty: journalEmptyExpected,
    },
  ],
  [
    'GatewayDiseaseReportReader.findPendingReports',
    {
      coreData: (row) => ({ disease_reports: [row] }),
      read: (c) => new GatewayDiseaseReportReader(c).findPendingReports(),
      readPrisma: () => new PrismaDiseaseReportRepository().findPendingReports(),
      prismaFn: () => mock(prisma.diseaseReport.findMany),
      many: true,
      row: pendingReportRow,
      empty: { ...pendingReportRow, parcel: null, household: null },
      // The port types these as string, so a row Hasura hides the relation of must still satisfy it.
      expectedForEmpty: [expect.objectContaining({ farmer_name: '', parcel_code: '' })],
    },
  ],
  [
    'GatewayDiseaseReportReader.findHistoryByFarmer',
    {
      coreData: (row) => ({ disease_reports: [row] }),
      read: (c) => new GatewayDiseaseReportReader(c).findHistoryByFarmer('kc1'),
      readPrisma: () => new PrismaDiseaseReportRepository().findHistoryByFarmer('kc1'),
      prismaFn: () => mock(prisma.diseaseReport.findMany),
      many: true,
      row: historyReportRow,
      empty: { ...historyReportRow, parcel: null, treatment_recommendation: null },
      expectedForEmpty: [expect.objectContaining({ parcel_code: '', treatment_recommendation: null })],
    },
  ],
]

beforeEach(() => jest.clearAllMocks())

describe.each(cases)('%s', (_name, c) => {
  test('returns the same shape as its Prisma repository for the same fixture', async () => {
    c.prismaFn().mockResolvedValue(c.many ? [c.row] : c.row)
    const expected = await c.readPrisma()

    const { client } = fakeCore(c.coreData(asCoreRow(c.row) as never))

    await expect(c.read(client)).resolves.toEqual(expected)
  })

  test('returns null fields for a null relationship and no crop cycle', async () => {
    const { client } = fakeCore(c.coreData(asCoreRow(c.empty) as never))
    await expect(c.read(client)).resolves.toEqual(c.expectedForEmpty)
  })
})

describe('filters', () => {
  const where = (graphql: jest.Mock) => graphql.mock.calls[0][1].where

  test('parcel findAll filters by household and status', async () => {
    const { client, graphql } = fakeCore({ parcels: [] })
    await new GatewayParcelReader(client).findAll({ household_id: 'h1', status: 'TENDING' })
    expect(where(graphql)).toEqual({ household_id: { _eq: 'h1' }, status: { _eq: 'TENDING' } })
  })

  test('lot findAll prefers statuses over status and leaves the HTX to Hasura', async () => {
    const { client, graphql } = fakeCore({ lots: [] })
    await new GatewayLotReader(client).findAll({ status: 'DRAFT', statuses: ['READY', 'QR_EXPORTED'], htx_profile_id: 'htx-tc' })
    expect(where(graphql)).toEqual({ status: { _in: ['READY', 'QR_EXPORTED'] } })
  })

  test('lot findAll filters by a single status', async () => {
    const { client, graphql } = fakeCore({ lots: [] })
    await new GatewayLotReader(client).findAll({ status: 'READY' })
    expect(where(graphql)).toEqual({ status: { _eq: 'READY' } })
  })

  test('household findAll sends no HTX filter', async () => {
    const { client, graphql } = fakeCore({ households: [] })
    await new GatewayHouseholdReader(client).findAll('htx-tc')
    expect(JSON.stringify(graphql.mock.calls[0])).not.toContain('htx-tc')
  })

  test('journal findAll filters by parcel, status and household, and pages', async () => {
    const { client, graphql } = fakeCore({ journal_entries: [], ...journalAggregate(0) })
    await new GatewayJournalReader(client).findAll({ parcel_id: 'p1', status: 'APPROVED', household_id: 'h1', page: 3, limit: 5 })
    expect(graphql.mock.calls[0][1]).toEqual({
      where: { parcel_id: { _eq: 'p1' }, status: { _eq: 'APPROVED' }, parcel: { household_id: { _eq: 'h1' } } },
      limit: 5,
      offset: 10,
    })
  })

  test('journal findAll defaults to the first 20', async () => {
    const { client, graphql } = fakeCore({ journal_entries: [], ...journalAggregate(0) })
    await new GatewayJournalReader(client).findAll({})
    expect(graphql.mock.calls[0][1]).toEqual({ where: {}, limit: 20, offset: 0 })
  })

  test('disease history asks for the farmer only', async () => {
    const { client, graphql } = fakeCore({ disease_reports: [] })
    await new GatewayDiseaseReportReader(client).findHistoryByFarmer('kc1')
    expect(graphql.mock.calls[0][1]).toEqual({ farmerId: 'kc1' })
  })

  test('journal findAll returns total from the aggregate', async () => {
    const { client } = fakeCore({ journal_entries: [], ...journalAggregate(42) })
    await expect(new GatewayJournalReader(client).findAll({})).resolves.toEqual({ entries: [], total: 42 })
  })
})

describe('a record Hasura hides', () => {
  test.each([
    ['parcel', (c: CoreGatewayClient) => new GatewayParcelReader(c).findById('x'), { parcels_by_pk: null }],
    ['household', (c: CoreGatewayClient) => new GatewayHouseholdReader(c).findById('x'), { households_by_pk: null }],
    ['lot', (c: CoreGatewayClient) => new GatewayLotReader(c).findById('x'), { lots_by_pk: null }],
    ['journal entry', (c: CoreGatewayClient) => new GatewayJournalReader(c).findById('x'), { journal_entries_by_pk: null }],
  ])('%s findById returns null', async (_name, read, data) => {
    await expect(read(fakeCore(data).client)).resolves.toBeNull()
  })
})
