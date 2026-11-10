/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import { prisma } from '@/infrastructure/db/prisma.client'
import * as households from '@/app/api/farm/households/route'
import * as lots from '@/app/api/lots/route'
import * as search from '@/app/api/search/route'
import * as bulletin from '@/app/api/bulletin/route'
import { PrismaParcelRepository } from '@/infrastructure/db/farm/PrismaParcelRepository'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'
import type { PrismaClient } from '@prisma/client'

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/auth/core-token', () => ({ getCoreToken: jest.fn().mockResolvedValue('tok') }))
jest.mock('@/infrastructure/db/prisma.client', () => ({
  prisma: {
    htxProfile: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    household: { findMany: jest.fn(), findUnique: jest.fn() },
    parcel: { findMany: jest.fn(), create: jest.fn() },
    lot: { findMany: jest.fn() },
    bulletin: { findFirst: jest.fn() },
  },
}))

const mock = (fn: unknown) => fn as jest.Mock
const tc = { id: 'htx-tc', name: 'HTX TC', htx_code: 'TC', crop_types: ['Chè'], total_area_ha: 0 }

function signIn(role: string, htxCode: string | null) {
  mock(auth).mockResolvedValue({ user: { id: 'u1', role, htxCode } })
}

const get = (path: string) => new Request(`http://localhost${path}`)
const post = (path: string) => new Request(`http://localhost${path}`, { method: 'POST', body: '{}' })

const coreFetch = jest.fn()
const coreRequest = () => {
  const [, init] = coreFetch.mock.calls[0]
  return { role: init.headers['x-hasura-role'], body: init.body as string }
}

beforeEach(() => {
  jest.clearAllMocks()
  mock(prisma.htxProfile.findUnique).mockImplementation(async ({ where }) => (where.htx_code === 'TC' ? tc : null))
  // Whatever a stray findFirst would pick, it must never be used.
  mock(prisma.htxProfile.findFirst).mockResolvedValue({ id: 'htx-oldest', crop_types: ['Chè'], season_label: 'Sai' })
  mock(prisma.household.findMany).mockResolvedValue([])
  mock(prisma.parcel.findMany).mockResolvedValue([])
  mock(prisma.lot.findMany).mockResolvedValue([])
  coreFetch.mockImplementation(async () => new Response(JSON.stringify({ data: { households: [], lots: [] } })))
  global.fetch = coreFetch as unknown as typeof fetch
})

const routes: [string, () => Promise<Response>][] = [
  ['GET households', () => households.GET(get('/api/farm/households'), {})],
  ['POST households', () => households.POST(post('/api/farm/households'), {})],
  ['GET lots', () => lots.GET(get('/api/lots'), {})],
  ['POST lots', () => lots.POST(post('/api/lots'), {})],
  ['GET search', () => search.GET(get('/api/search?q=abc'), {})],
  ['GET bulletin', () => bulletin.GET(get('/api/bulletin'), {})],
]

describe.each(routes)('%s', (_name, call) => {
  test('answers 403 NO_HTX for a code with no HTX, without another HTX', async () => {
    signIn('officer', 'XX')
    const response = await call()
    expect(response.status).toBe(403)
    expect((await response.json()).error.code).toBe('NO_HTX')
    expect(prisma.htxProfile.findFirst).not.toHaveBeenCalled()
  })

  test('answers 403 NO_HTX without a code', async () => {
    signIn('officer', null)
    expect((await call()).status).toBe(403)
    expect(prisma.htxProfile.findFirst).not.toHaveBeenCalled()
  })

  test('answers 401 without a session', async () => {
    mock(auth).mockResolvedValue(null)
    expect((await call()).status).toBe(401)
  })
})

describe('routes read the caller HTX', () => {
  // The list reads go through Hasura now, which applies the caller's HTX from the token.
  test('households are listed through the core as the caller role', async () => {
    signIn('officer', 'TC')
    expect((await households.GET(get('/api/farm/households'), {})).status).toBe(200)
    expect(coreRequest().role).toBe('officer')
    expect(coreRequest().body).not.toContain('htx-tc')
    expect(prisma.household.findMany).not.toHaveBeenCalled()
  })

  test('lots are listed through the core as the caller role', async () => {
    signIn('manager', 'TC')
    expect((await lots.GET(get('/api/lots'), {})).status).toBe(200)
    expect(coreRequest().role).toBe('manager')
    expect(coreRequest().body).not.toContain('htx-tc')
    expect(prisma.lot.findMany).not.toHaveBeenCalled()
  })

  test('search stays inside the caller HTX', async () => {
    signIn('farmer', 'TC')
    expect((await search.GET(get('/api/search?q=abc'), {})).status).toBe(200)
    expect(mock(prisma.household.findMany).mock.calls[0][0].where.htx_profile_id).toBe('htx-tc')
  })

  test.each([
    [['Chè'], 'Tea'],
    [['Chè Trung du', 'Chè LDP1'], 'Tea'],
    [['Cà phê'], 'Coffee'],
    [[], 'Tea'],
  ])('bulletin defaults to the crop of the caller HTX: %j -> %s', async (crops, commodity) => {
    signIn('manager', 'TC')
    mock(prisma.htxProfile.findUnique).mockImplementation(async ({ where }) => (where.htx_code === 'TC' ? { ...tc, crop_types: crops } : null))
    mock(prisma.bulletin.findFirst).mockResolvedValue({ id: 'b1', commodity })
    expect((await bulletin.GET(get('/api/bulletin'), {})).status).toBe(200)
    expect(mock(prisma.bulletin.findFirst).mock.calls[0][0].where.commodity).toBe(commodity)
  })

  test('role checks still apply after the HTX is known', async () => {
    signIn('farmer', 'TC')
    expect((await households.GET(get('/api/farm/households'), {})).status).toBe(403)
    expect(coreFetch).not.toHaveBeenCalled()
    expect(prisma.household.findMany).not.toHaveBeenCalled()
  })
})

describe('code below the routes', () => {
  const parcel = { household_id: 'h1', parcel_code: 'P1', geojson: {}, area_ha: 1, centroid_lat: 0, centroid_lng: 0 }

  beforeEach(() => mock(prisma.parcel.create).mockResolvedValue({ id: 'p1', ...parcel, household: {} }))

  const createdSeason = () => mock(prisma.parcel.create).mock.calls[0][0].data.crop_cycles.create[0].season

  test('a new parcel takes the season label of its household HTX', async () => {
    mock(prisma.household.findUnique).mockResolvedValue({ htx_profile: { season_label: 'Vụ xuân TC' } })
    await new PrismaParcelRepository().create(parcel)
    expect(prisma.household.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'h1' } }))
    expect(createdSeason()).toBe('Vụ xuân TC')
    expect(prisma.htxProfile.findFirst).not.toHaveBeenCalled()
  })

  test('a household without an HTX gets the neutral season label, not another HTX', async () => {
    mock(prisma.household.findUnique).mockResolvedValue({ htx_profile: null })
    await new PrismaParcelRepository().create(parcel)
    expect(createdSeason()).toBe('Vụ mùa mới')
    expect(prisma.htxProfile.findFirst).not.toHaveBeenCalled()
  })

  const profiles = () => new PrismaHtxProfileRepository(prisma as unknown as PrismaClient)

  test('getProfile reads the requested HTX only', async () => {
    await expect(profiles().getProfile('TC')).resolves.toMatchObject({ id: 'htx-tc' })
    await expect(profiles().getProfile('XX')).resolves.toBeNull()
    expect(prisma.htxProfile.findFirst).not.toHaveBeenCalled()
  })

  test('updateProfile writes the requested HTX only', async () => {
    mock(prisma.htxProfile.update).mockResolvedValue(tc)
    await profiles().updateProfile('TC', { name: 'HTX TC', address: 'A', crop_types: [] } as never)
    expect(prisma.htxProfile.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'htx-tc' } }))
    expect(prisma.htxProfile.findFirst).not.toHaveBeenCalled()
  })

  test('updateProfile refuses an unknown HTX', async () => {
    await expect(profiles().updateProfile('XX', { name: 'X' } as never)).rejects.toThrow('HTX Profile not found')
    expect(prisma.htxProfile.update).not.toHaveBeenCalled()
  })
})
