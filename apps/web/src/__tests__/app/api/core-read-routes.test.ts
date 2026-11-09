/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import { prisma } from '@/infrastructure/db/prisma.client'
import { logger } from '@/lib/logger'
import * as parcels from '@/app/api/farm/parcels/route'
import * as households from '@/app/api/farm/households/route'
import * as household from '@/app/api/farm/households/[id]/route'
import * as lots from '@/app/api/lots/route'
import * as lot from '@/app/api/lots/[id]/route'
import * as journal from '@/app/api/journal/route'
import * as diseases from '@/app/api/officer/diseases/route'
import * as weather from '@/app/api/weather/route'
import ManagerZonesPage from '@/app/manager/zones/page'
import LotDetailPage from '@/app/manager/lots/[lot_code]/page'
import OfficerDiseasesPage from '@/app/officer/diseases/page'
import DiagnosisPage from '@/app/farmer/diagnosis/page'
import { getDiagnosisHistory, getFarmerParcels } from '@/app/farmer/diagnosis/actions'
import { LotStatus, ParcelStatus } from '@prisma/client'
import { parcelListQuerySchema } from '@/lib/validations/parcel.schema'
import { lotListQuerySchema } from '@/lib/validations/lot.schema'

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/auth/core-token', () => ({ getCoreToken: jest.fn().mockResolvedValue('tok') }))
jest.mock('@/lib/sse-emitter', () => ({ sseEmitter: { emit: jest.fn() }, SSE_EVENTS: {} }))
jest.mock('@/infrastructure/storage/minio-storage.adapter', () => ({
  MinioStorageAdapter: jest.fn(() => ({ getPresignedUrl: jest.fn().mockResolvedValue('http://signed') })),
}))
jest.mock('@/infrastructure/storage/minio-document.adapter', () => ({
  MinioDocumentAdapter: jest.fn(() => ({ generateDownloadUrl: jest.fn().mockResolvedValue('http://signed') })),
}))
jest.mock('@/infrastructure/db/farm/PrismaWeatherCacheRepository', () => ({
  PrismaWeatherCacheRepository: jest.fn(() => ({ findNearest: jest.fn().mockResolvedValue(null) })),
}))
jest.mock('@/infrastructure/db/repositories/prisma-lot-trace-repository', () => ({
  PrismaLotTraceRepository: jest.fn(() => ({ getLotByCode: jest.fn().mockResolvedValue({ lot_code: 'L-1' }) })),
}))
jest.mock('@/infrastructure/db/prisma.client', () => ({
  prisma: {
    htxProfile: { findUnique: jest.fn() },
    household: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
    parcel: { findMany: jest.fn(), findUnique: jest.fn() },
    lot: { findMany: jest.fn(), findUnique: jest.fn() },
    journalEntry: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
    diseaseReport: { findMany: jest.fn() },
  },
}))

const mock = (fn: unknown) => fn as jest.Mock
const CUID = 'cjld2cjxh0000qzrmn831i7rn'
const get = (path: string) => new Request(`http://localhost${path}`)
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

const parcelRow = {
  id: CUID,
  parcel_code: 'P-1',
  household_id: 'h1',
  crop_type: 'Chè',
  area_ha: 1,
  centroid_lat: 21,
  centroid_lng: 105,
  polygon_geojson: null,
  status: 'TENDING',
  household: null,
  crop_cycles: [],
}
const lotRow = {
  id: 'l1',
  lot_code: 'L-1',
  commodity: 'Chè',
  harvest_date: '2026-07-20T01:02:03',
  estimated_weight_kg: null,
  actual_weight_kg: null,
  status: 'READY',
  created_at: '2026-07-20T01:02:03',
  lot_parcels: [],
}
const coreData = {
  parcels: [parcelRow],
  parcels_by_pk: parcelRow,
  households: [],
  households_by_pk: { id: 'h1', name: 'A', phone: '1', address: null, keycloak_user_id: null, parcels: [] },
  lots: [lotRow],
  lots_by_pk: lotRow,
  journal_entries: [],
  journal_entries_aggregate: { aggregate: { count: 0 } },
  disease_reports: [],
}

const coreFetch = jest.fn()

function signIn(role: string) {
  mock(auth).mockResolvedValue({ user: { id: 'u1', role, htxCode: 'TC', name: 'U' } })
}

const routes: [string, string, () => Promise<Response>][] = [
  ['GET farm/parcels', 'officer', () => parcels.GET(get('/api/farm/parcels'), {})],
  ['GET farm/households', 'officer', () => households.GET(get('/api/farm/households'), {})],
  ['GET farm/households/[id]', 'manager', () => household.GET(get('/api/farm/households/h1'), ctx('h1'))],
  ['GET lots', 'manager', () => lots.GET(get('/api/lots'), {})],
  ['GET lots/[id]', 'manager', () => lot.GET(get('/api/lots/l1'), ctx('l1'))],
  ['GET journal', 'officer', () => journal.GET(get('/api/journal'), {})],
  ['GET officer/diseases', 'officer', () => diseases.GET(get('/api/officer/diseases'), {})],
  ['GET weather', 'officer', () => weather.GET(get(`/api/weather?date=2026-08-14&parcelId=${CUID}`), {})],
]

const pages: [string, string, () => Promise<unknown>][] = [
  ['manager/zones', 'manager', () => ManagerZonesPage()],
  ['manager/lots/[lot_code]', 'manager', () => LotDetailPage({ params: { lot_code: 'l1' } })],
  ['officer/diseases', 'officer', () => OfficerDiseasesPage()],
  ['farmer/diagnosis history', 'farmer', () => getDiagnosisHistory()],
]

const prismaReads = () => [
  prisma.parcel.findMany,
  prisma.parcel.findUnique,
  prisma.household.findMany,
  prisma.household.findUnique,
  prisma.lot.findMany,
  prisma.lot.findUnique,
  prisma.journalEntry.findMany,
  prisma.journalEntry.count,
  prisma.diseaseReport.findMany,
]
const expectGatewayRead = (role: string) => {
  expect(coreFetch).toHaveBeenCalled()
  expect(coreFetch.mock.calls[0][1].headers['x-hasura-role']).toBe(role)
  for (const read of prismaReads()) expect(read).not.toHaveBeenCalled()
}

beforeAll(() => {
  process.env.CORE_GATEWAY_URL = 'http://gateway:9081'
})

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  jest.spyOn(logger, 'error').mockImplementation(() => undefined)
  mock(prisma.htxProfile.findUnique).mockResolvedValue({ id: 'htx-tc', htx_code: 'TC' })
  coreFetch.mockImplementation(async () => new Response(JSON.stringify({ data: coreData })))
  global.fetch = coreFetch as unknown as typeof fetch
})

describe.each(routes)('%s', (_name, role, call) => {
  test('reads through the core gateway as the caller role', async () => {
    signIn(role)
    expect((await call()).status).toBe(200)
    expectGatewayRead(role)
  })

  test('answers 503 CORE_UNAVAILABLE when the gateway is down', async () => {
    signIn(role)
    coreFetch.mockRejectedValue(new TypeError('fetch failed'))
    const response = await call()
    expect(response.status).toBe(503)
    expect((await response.json()).error.code).toBe('CORE_UNAVAILABLE')
  })

  test('answers 401 when the gateway refuses the token', async () => {
    signIn(role)
    coreFetch.mockImplementation(async () => new Response('{}', { status: 401 }))
    const response = await call()
    expect(response.status).toBe(401)
    expect((await response.json()).error.code).toBe('UNAUTHORIZED')
  })

  test('answers 403 FORBIDDEN when the gateway forbids the request', async () => {
    signIn(role)
    coreFetch.mockImplementation(async () => new Response('{}', { status: 403 }))
    const response = await call()
    expect(response.status).toBe(403)
    expect((await response.json()).error.code).toBe('FORBIDDEN')
  })
})

describe.each(pages)('%s', (_name, role, call) => {
  test('reads through the core gateway as the caller role', async () => {
    signIn(role)
    await call()
    expectGatewayRead(role)
  })

  test('lets the gateway failure reach error.tsx with its digest', async () => {
    signIn(role)
    coreFetch.mockRejectedValue(new TypeError('fetch failed'))
    await expect(call()).rejects.toMatchObject({ digest: 'CORE_UNAVAILABLE' })
  })

  test('lets a refused token reach error.tsx with its digest', async () => {
    signIn(role)
    coreFetch.mockImplementation(async () => new Response('{}', { status: 401 }))
    await expect(call()).rejects.toMatchObject({ digest: 'CORE_UNAUTHORIZED' })
  })
})

test('farmer parcels are read through the core once the household is known', async () => {
  signIn('farmer')
  mock(prisma.household.findFirst).mockResolvedValue({ id: 'h1' })
  await expect(getFarmerParcels()).resolves.toEqual([{ id: CUID, parcel_code: 'P-1', name: 'P-1' }])
  expectGatewayRead('farmer')
})

test('the diagnosis page sends the user to login when the gateway refuses the token', async () => {
  signIn('farmer')
  mock(prisma.household.findFirst).mockResolvedValue({ id: 'h1' })
  coreFetch.mockImplementation(async () => new Response('{}', { status: 401 }))
  await expect(DiagnosisPage()).rejects.toMatchObject({ digest: expect.stringContaining('/login') })
})

describe('list routes refuse bad query input before reaching the core', () => {
  const badQueries: [string, string, (url: string) => Promise<Response>, string][] = [
    ['parcels status', 'officer', (url) => parcels.GET(get(url), {}), '/api/farm/parcels?status=BOGUS'],
    ['lots status', 'manager', (url) => lots.GET(get(url), {}), '/api/lots?status=BOGUS'],
    ['journal status', 'officer', (url) => journal.GET(get(url), {}), '/api/journal?status=BOGUS'],
    ['journal limit text', 'officer', (url) => journal.GET(get(url), {}), '/api/journal?limit=abc'],
    ['journal negative limit', 'officer', (url) => journal.GET(get(url), {}), '/api/journal?limit=-1'],
    ['journal zero limit', 'officer', (url) => journal.GET(get(url), {}), '/api/journal?limit=0'],
    ['journal fractional limit', 'officer', (url) => journal.GET(get(url), {}), '/api/journal?limit=1.5'],
    ['journal limit beyond a GraphQL Int', 'officer', (url) => journal.GET(get(url), {}), '/api/journal?limit=1e30'],
    ['journal page text', 'officer', (url) => journal.GET(get(url), {}), '/api/journal?page=abc'],
    ['journal page zero', 'officer', (url) => journal.GET(get(url), {}), '/api/journal?page=0'],
  ]

  test.each(badQueries)('%s answers 400', async (_name, role, call, url) => {
    signIn(role)
    const response = await call(url)
    expect(response.status).toBe(400)
    expect((await response.json()).error.code).toBe('VALIDATION_ERROR')
    expect(coreFetch).not.toHaveBeenCalled()
  })

  const goodQueries: [string, string, (url: string) => Promise<Response>, string][] = [
    ['parcels with a status', 'officer', (url) => parcels.GET(get(url), {}), '/api/farm/parcels?status=TENDING'],
    ['parcels with an empty status', 'officer', (url) => parcels.GET(get(url), {}), '/api/farm/parcels?status='],
    ['lots with a status', 'manager', (url) => lots.GET(get(url), {}), '/api/lots?status=READY'],
    ['journal approved', 'officer', (url) => journal.GET(get(url), {}), '/api/journal?status=APPROVED'],
    ['journal pending', 'officer', (url) => journal.GET(get(url), {}), '/api/journal?status=PENDING_APPROVAL&page=2&limit=50'],
  ]

  test.each(goodQueries)('%s still reaches the core', async (_name, role, call, url) => {
    signIn(role)
    expect((await call(url)).status).toBe(200)
    expect(coreFetch).toHaveBeenCalled()
  })

  test('the status lists match the database enums', () => {
    for (const status of Object.values(ParcelStatus)) expect(parcelListQuerySchema.safeParse({ status }).success).toBe(true)
    for (const status of Object.values(LotStatus)) expect(lotListQuerySchema.safeParse({ status }).success).toBe(true)
  })
})
