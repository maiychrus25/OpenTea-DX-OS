/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import { prisma } from '@/infrastructure/db/prisma.client'
import * as households from '@/app/api/farm/households/[id]/route'
import * as parcelById from '@/app/api/farm/parcels/[id]/route'
import * as parcels from '@/app/api/farm/parcels/route'
import * as soilHealth from '@/app/api/farm/parcels/[id]/soil-health/route'
import * as approveHarvest from '@/app/api/parcels/[id]/approve-harvest/route'
import * as latestPhoto from '@/app/api/parcels/[id]/latest-photo/route'
import * as startRound from '@/app/api/parcels/[id]/start-round/route'
import * as journalById from '@/app/api/journal/[id]/route'
import * as journal from '@/app/api/journal/route'
import * as batchApprove from '@/app/api/journal/batch-approve/route'
import * as exportQr from '@/app/api/lots/[id]/export-qr/route'
import * as lots from '@/app/api/lots/route'
import * as diseaseReview from '@/app/api/officer/diseases/[id]/review/route'
import * as harvest from '@/app/api/schedule/harvest/[cycle_id]/route'
import * as diagnosis from '@/app/api/diagnosis/route'
import * as harvestSchedule from '@/app/api/schedule/harvest/route'
import * as unscheduled from '@/app/api/schedule/unscheduled/route'
import * as forecast from '@/app/api/weather/forecast/route'
import * as appStore from '@/app/api/app-store/route'
import * as appStoreRequests from '@/app/api/app-store/requests/route'
import SoilHealthPage from '@/app/officer/households/[id]/soil-health/page'

// Every model method is a jest.fn created on first use, so any write the routes attempt is recorded.
jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/auth/core-token', () => ({ getCoreToken: jest.fn() }))
jest.mock('@/infrastructure/db/prisma.client', () => {
  const fns = new Map<string, jest.Mock>()
  const method = (model: string, name: string) => {
    const key = `${model}.${name}`
    if (!fns.has(key)) fns.set(key, jest.fn())
    return fns.get(key)!
  }
  const prisma = new Proxy({ __fns: fns } as Record<string, unknown>, {
    get: (target, model: string) =>
      model in target ? target[model] : model.startsWith('$') ? method('prisma', model) : new Proxy({}, { get: (_t, name: string) => method(model, name) }),
  })
  return { prisma }
})
jest.mock('@prisma/client', () => ({
  ...jest.requireActual('@prisma/client'),
  PrismaClient: jest.fn(() => require('@/infrastructure/db/prisma.client').prisma),
}))

const mock = (fn: unknown) => fn as jest.Mock
const fns = () => (prisma as unknown as { __fns: Map<string, jest.Mock> }).__fns
const WRITE = /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)$|\.\$transaction$/

const tc = { id: 'htx-tc', htx_code: 'TC', name: 'HTX TC', crop_types: [] }
const linked = (htx: string) => ({
  htx_profile_id: htx,
  household: { htx_profile_id: htx },
  parcel: { household: { htx_profile_id: htx } },
})
const CUID = 'cjld2cjxh0000qzrmn831i7rn'

function signIn(role: string) {
  mock(auth).mockResolvedValue({ user: { id: 'u1', role, htxCode: 'TC', name: 'U' } })
}
// any: each route types its context differently (promise or plain params)
function ctx(id: string, key = 'id'): any {
  // Routes read params either as a promise or as a plain object.
  return { params: Object.assign(Promise.resolve({ [key]: id }), { [key]: id }) }
}
const json = (method: string, body: unknown = {}) =>
  new Request('http://localhost/api/x', { method, body: method === 'GET' ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json' } })
const imageForm = () => {
  const form = new FormData()
  form.set('image', new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' }))
  form.set('parcel_id', CUID)
  return new Request('http://localhost/api/diagnosis', { method: 'POST', body: form })
}
const activity = [{ activity_type: 'OTHER' }]

type Row = { name: string; role: string; call: () => Promise<Response> }
const rows: Row[] = [
  { name: 'PUT farm/households/[id]', role: 'officer', call: () => households.PUT(json('PUT', { owner_name: 'X' }), ctx('r1')) },
  { name: 'PUT farm/parcels/[id]', role: 'officer', call: () => parcelById.PUT(json('PUT', { name: 'X' }), ctx('r1')) },
  { name: 'DELETE farm/parcels/[id]', role: 'officer', call: () => parcelById.DELETE(json('DELETE'), ctx('r1')) },
  {
    name: 'POST farm/parcels',
    role: 'officer',
    call: () =>
      parcels.POST(
        json('POST', { household_id: 'r1', parcel_code: 'P1', geojson: {}, area_ha: 1, centroid_lat: 1, centroid_lng: 1 }),
        {},
      ),
  },
  { name: 'GET farm/parcels/[id]/soil-health', role: 'officer', call: () => soilHealth.GET(json('GET'), ctx('r1')) },
  { name: 'POST parcels/[id]/approve-harvest', role: 'officer', call: () => approveHarvest.POST(json('POST'), ctx('r1')) },
  { name: 'GET parcels/[id]/latest-photo', role: 'officer', call: () => latestPhoto.GET(json('GET'), ctx('r1')) },
  { name: 'POST parcels/[id]/start-round', role: 'officer', call: () => startRound.POST(json('POST'), ctx('r1')) },
  { name: 'PUT journal/[id]', role: 'officer', call: () => journalById.PUT(json('PUT', { observation: 'x' }), ctx('r1')) },
  { name: 'DELETE journal/[id]', role: 'officer', call: () => journalById.DELETE(json('DELETE'), ctx('r1')) },
  {
    name: 'POST journal',
    role: 'officer',
    call: () => journal.POST(json('POST', { parcel_id: 'r1', entry_date: '2026-01-01', activities: activity }), {}),
  },
  { name: 'POST journal/batch-approve', role: 'officer', call: () => batchApprove.POST(json('POST', { entry_ids: ['r1'] }), {}) },
  { name: 'POST lots/[id]/export-qr', role: 'officer', call: () => exportQr.POST(json('POST'), ctx('r1')) },
  {
    name: 'POST lots',
    role: 'officer',
    call: () => lots.POST(json('POST', { crop: 'Chè', harvest_date: '2026-01-01', parcel_ids: ['r1'] }), {}),
  },
  {
    name: 'PUT officer/diseases/[id]/review',
    role: 'officer',
    call: () => diseaseReview.PUT(json('PUT', { status: 'REJECTED' }), ctx('r1')),
  },
  {
    name: 'PATCH schedule/harvest/[cycle_id]',
    role: 'manager',
    call: () => harvest.PATCH(json('PATCH', { estimated_harvest_date: '2026-01-01T00:00:00.000Z' }), ctx('r1', 'cycle_id')),
  },
  { name: 'POST diagnosis', role: 'farmer', call: () => diagnosis.POST(imageForm()) },
]

beforeEach(() => {
  fns().forEach((fn) => fn.mockReset())
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  // Every record looked up belongs to LB; the caller is in TC.
  const reads = ['household', 'parcel', 'lot', 'journalEntry', 'diseaseReport', 'parcelCropCycle']
  for (const model of reads) mock((prisma as any)[model].findUnique).mockResolvedValue(linked('htx-lb'))
  mock(prisma.htxProfile.findUnique).mockResolvedValue(tc)
})

const writes = () => Array.from(fns().entries()).filter(([key, fn]) => WRITE.test(key) && fn.mock.calls.length > 0).map(([key]) => key)

describe.each(rows)('$name', ({ role, call }) => {
  test('answers 404 for a record of another HTX and writes nothing', async () => {
    signIn(role)
    const response = await call()
    expect(response.status).toBe(404)
    expect(writes()).toEqual([])
  })
})

describe('POST lots', () => {
  test('rejects the whole lot when one of its parcels belongs to another HTX', async () => {
    signIn('officer')
    mock(prisma.parcel.findUnique).mockImplementation(async ({ where }: any) => linked(where.id === 'own' ? 'htx-tc' : 'htx-lb'))
    const response = await lots.POST(json('POST', { crop: 'Chè', harvest_date: '2026-01-01', parcel_ids: ['own', 'foreign'] }), {})
    expect(response.status).toBe(404)
    expect(writes()).toEqual([])
  })
})

describe('POST journal/batch-approve', () => {
  test('approves nothing when one entry belongs to another HTX', async () => {
    signIn('officer')
    mock(prisma.journalEntry.findUnique).mockImplementation(async ({ where }: any) => linked(where.id === 'own' ? 'htx-tc' : 'htx-lb'))
    const response = await batchApprove.POST(json('POST', { entry_ids: ['own', 'foreign'] }), {})
    expect(response.status).toBe(404)
    expect(writes()).toEqual([])
    expect(mock(prisma.journalEntry.findUnique)).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'foreign' } }))
  })
})

describe('read routes return only the HTX of the caller', () => {
  const ownHousehold = { household: { htx_profile_id: 'htx-tc' } }
  const noHtx = () => mock(auth).mockResolvedValue({ user: { id: 'u1', role: 'manager', htxCode: null, name: 'U' } })
  const range = 'start_date=2026-01-01T00:00:00.000Z&end_date=2026-02-01T00:00:00.000Z'
  const harvestRequest = () => new Request(`http://localhost/api/schedule/harvest?${range}`)

  test('GET schedule/harvest filters the cycles by HTX', async () => {
    signIn('officer')
    mock(prisma.parcelCropCycle.findMany).mockResolvedValue([])
    expect((await harvestSchedule.GET(harvestRequest(), {})).status).toBe(200)
    expect(mock(prisma.parcelCropCycle.findMany).mock.calls[0][0].where.parcel).toEqual(ownHousehold)
  })

  test('GET schedule/unscheduled filters the cycles by HTX', async () => {
    signIn('manager')
    mock(prisma.parcelCropCycle.findMany).mockResolvedValue([])
    expect((await unscheduled.GET(new Request('http://localhost/api/schedule/unscheduled'), {})).status).toBe(200)
    expect(mock(prisma.parcelCropCycle.findMany).mock.calls[0][0].where.parcel).toEqual(ownHousehold)
  })

  test('GET weather/forecast filters the parcels by HTX', async () => {
    signIn('farmer')
    mock(prisma.parcel.findMany).mockResolvedValue([])
    expect((await forecast.GET(new Request('http://localhost/api/weather/forecast'), {})).status).toBe(200)
    expect(mock(prisma.parcel.findMany).mock.calls[0][0].where.household).toEqual({ htx_profile_id: 'htx-tc' })
  })

  test.each([
    ['schedule/harvest', () => harvestSchedule.GET(harvestRequest(), {})],
    ['schedule/unscheduled', () => unscheduled.GET(new Request('http://localhost/api/schedule/unscheduled'), {})],
    ['weather/forecast', () => forecast.GET(new Request('http://localhost/api/weather/forecast'), {})],
  ])('GET %s answers NO_HTX for a user without an HTX and reads nothing', async (_name, call) => {
    noHtx()
    expect((await call()).status).toBe(403)
    expect(mock(prisma.parcelCropCycle.findMany)).not.toHaveBeenCalled()
    expect(mock(prisma.parcel.findMany)).not.toHaveBeenCalled()
  })

  test('the officer soil-health page reads the household name inside the HTX', async () => {
    signIn('officer')
    mock(prisma.household.findFirst).mockResolvedValue(null)
    await SoilHealthPage({ params: Promise.resolve({ id: 'r1' }) })
    expect(mock(prisma.household.findFirst).mock.calls[0][0].where).toEqual({ id: 'r1', htx_profile_id: 'htx-tc' })
    expect(mock(prisma.household.findUnique)).not.toHaveBeenCalled()
  })
})

describe('App Store requests', () => {
  test('POST app-store/requests queues for the HTX of the session, not the one in the body', async () => {
    signIn('manager')
    mock(prisma.htxProfile.findUnique).mockResolvedValue(tc)
    const request = (prisma as any).$queryRaw as jest.Mock
    request.mockImplementation(async (strings: string[]) => {
      const text = strings.join('?')
      if (text.includes('app_catalog')) return [{ id: 'hello', name: 'H', version: '1', description: '', license: 'MIT', publisher: 'P', roles: [], has_public: false }]
      return []
    })
    const response = await appStoreRequests.POST(
      new Request('http://localhost/api/app-store/requests', {
        method: 'POST',
        body: JSON.stringify({ appId: 'hello', action: 'ENABLE', htxCode: 'LB', htx_code: 'LB' }),
      }),
      {},
    )
    expect(response.status).toBe(202)
    const insert = mock((prisma as any).$executeRaw).mock.calls[0]
    expect(insert.slice(1)).toEqual(['hello', 'TC', 'ENABLE', 'u1', 'U'])
    // Every read of the snapshot is bound to TC as well.
    expect(request.mock.calls.flatMap((call: unknown[]) => call.slice(1))).not.toContain('LB')
  })

  test.each(['officer', 'farmer'])('a %s cannot read or queue anything', async role => {
    signIn(role)
    expect((await appStore.GET(new Request('http://localhost/api/app-store'), {})).status).toBe(403)
    const post = new Request('http://localhost/api/app-store/requests', { method: 'POST', body: JSON.stringify({ appId: 'hello', action: 'ENABLE' }) })
    expect((await appStoreRequests.POST(post, {})).status).toBe(403)
    expect(mock((prisma as any).$executeRaw)).not.toHaveBeenCalled()
    expect(mock((prisma as any).$queryRaw)).not.toHaveBeenCalled()
  })
})
