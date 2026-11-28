/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { requireTenant } from '@/lib/api/tenant'
import * as tickets from '@/app/api/leaf-tickets/route'
import * as ticketVoid from '@/app/api/leaf-tickets/[id]/void/route'
import * as ticketById from '@/app/api/leaf-tickets/[id]/route'
import * as ticketsExport from '@/app/api/leaf-tickets/export.csv/route'
import * as ticketsMine from '@/app/api/leaf-tickets/mine/route'
import * as prices from '@/app/api/leaf-prices/today/route'
import * as grades from '@/app/api/leaf-grades/route'
import * as households from '@/app/api/households/route'
import * as withdrawal from '@/app/api/parcels/[id]/withdrawal-status/route'
import { FakeTicketPort, spray } from '../../../__tests__/__mocks__/weighing-fakes'

const fake = new FakeTicketPort()
const priceRepo = { listGrades: jest.fn(), createGrade: jest.fn(), updateGrade: jest.fn(), pricesFor: jest.fn(), upsertPrices: jest.fn() }
const guard = { household: jest.fn(), parcel: jest.fn(), leafGrade: jest.fn(), leafTicket: jest.fn(), cropCycle: jest.fn() }

jest.mock('@/application/zalo/zalo-services', () => ({ zaloNotifier: () => ({ enqueue: jest.fn(async () => ({ queued: 0, skipped: 0 })) }) }))
jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/tenant', () => ({ requireTenant: jest.fn() }))
jest.mock('@/lib/api/tenant-guard', () => ({ TenantGuard: jest.fn(() => guard) }))
jest.mock('@/infrastructure/db/weighing/PrismaFreshLeafTicketRepository', () => ({ PrismaFreshLeafTicketRepository: jest.fn(() => fake) }))
jest.mock('@/infrastructure/db/weighing/PrismaLeafPriceRepository', () => ({ PrismaLeafPriceRepository: jest.fn(() => priceRepo) }))

const signIn = (role: string) =>
  (requireTenant as jest.Mock).mockResolvedValue({ userId: 'u1', role, htxCode: 'TC', htxProfileId: 'htx-tc' })
const body = { household_id: 'hh-1', parcel_id: 'p-1', grade_id: 'g-1', gross_kg: 100, deduction_pct: 5 }
const post = (data: unknown) => tickets.POST(new Request('http://x/api/leaf-tickets', { method: 'POST', body: JSON.stringify(data) }), {})
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  jest.clearAllMocks()
  fake.sprays = []
  fake.price = 15000
  fake.tickets = []
  fake.locked = 0
  fake.voidOutcome = { kind: 'not_found' }
  fake.parcel.status = 'TENDING'
  jest.spyOn(fake, 'sprayEntries').mockImplementation(async () => fake.sprays)
})

describe('POST /api/leaf-tickets', () => {
  it('answers 201 with a ticket whose amount_vnd is a decimal string', async () => {
    signIn('accountant')
    const res = await post(body)
    expect(res.status).toBe(201)
    const { data } = await res.json()
    expect(data).toMatchObject({ net_kg: 95, price_vnd_per_kg: 15000, amount_vnd: '1425000', status: 'VALID', settlement_id: null })
    expect(typeof data.amount_vnd).toBe('string')
  })

  it('answers 409 PARCEL_IN_WITHDRAWAL with safe_from and writes nothing', async () => {
    signIn('accountant')
    fake.sprays = [spray('PENDING_APPROVAL', new Date(Date.now() + 5 * 86_400_000).toISOString())]
    const res = await post(body)
    expect(res.status).toBe(409)
    const { error } = await res.json()
    expect(error.code).toBe('PARCEL_IN_WITHDRAWAL')
    expect(error.safe_from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(error.message).toContain('TC-A1')
    expect(fake.tickets).toHaveLength(0)
  })

  it('answers 409 NO_PRICE_TODAY', async () => {
    signIn('manager')
    fake.price = null
    const res = await post(body)
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('NO_PRICE_TODAY')
  })

  it.each(['farmer', 'officer'])('a %s gets 403 and nothing is read or written', async (role) => {
    signIn(role)
    expect((await post(body)).status).toBe(403)
    expect(guard.household).not.toHaveBeenCalled()
    expect(fake.locked).toBe(0)
  })

  it.each([
    ['a bypass flag', { force: true }],
    ['a skip flag', { skip_withdrawal: true }],
    ['a time of weighing', { weighed_at: '2020-01-01T00:00:00Z' }],
    ['a deduction above 30', { deduction_pct: 31 }],
    ['a deduction below 0', { deduction_pct: -1 }],
    ['zero kg', { gross_kg: 0 }],
    ['more than 5000 kg', { gross_kg: 5000.1 }],
    ['two decimals', { gross_kg: 10.25 }],
    ['a client_id that is not a uuid', { client_id: 'abc' }],
  ])('rejects %s with 400 before anything is looked up', async (_name, extra) => {
    signIn('accountant')
    const res = await post({ ...body, ...extra })
    expect(res.status).toBe(400)
    expect(guard.household).not.toHaveBeenCalled()
    expect(fake.locked).toBe(0)
  })

  it('a client_id replay answers 200 with the first ticket', async () => {
    signIn('accountant')
    const first = await (await post(body)).json()
    jest.spyOn(fake, 'findByClientId').mockResolvedValue(first.data)
    const replay = await post({ ...body, client_id: '3f2b8c1e-5a47-4d0e-9b62-1c7a9e4d5f10' })
    expect(replay.status).toBe(200)
    expect((await replay.json()).data.id).toBe(first.data.id)
    expect(fake.tickets).toHaveLength(1)
  })
})

describe('POST /api/leaf-tickets/[id]/void', () => {
  it('needs a reason of 3 to 200 characters', async () => {
    signIn('accountant')
    for (const reason of ['', 'ab', 'x'.repeat(201), undefined]) {
      const res = await ticketVoid.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ reason }) }), ctx('t1'))
      expect(res.status).toBe(400)
    }
  })

  it('answers 409 TICKET_SETTLED for a settled ticket', async () => {
    signIn('manager')
    fake.voidOutcome = { kind: 'settled' }
    const res = await ticketVoid.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ reason: 'Cân nhầm' }) }), ctx('t1'))
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('TICKET_SETTLED')
  })

  it('answers 409 TICKET_IN_BATCH naming the batch', async () => {
    signIn('manager')
    fake.voidOutcome = { kind: 'in_batch', batch_code: 'TC-MS-20261128-01' }
    const res = await ticketVoid.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ reason: 'Cân nhầm' }) }), ctx('t1'))
    expect(res.status).toBe(409)
    const { error } = await res.json()
    expect(error.code).toBe('TICKET_IN_BATCH')
    expect(error.message).toBe('Phiếu đã vào mẻ sao TC-MS-20261128-01. Bỏ phiếu khỏi mẻ trước khi huỷ.')
  })

  it.each(['farmer', 'officer'])('a %s gets 403', async (role) => {
    signIn(role)
    expect((await ticketVoid.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ reason: 'Cân nhầm' }) }), ctx('t1'))).status).toBe(403)
    expect(guard.leafTicket).not.toHaveBeenCalled()
  })
})

describe('prices and grades', () => {
  it.each(['accountant', 'officer', 'farmer'])('a %s cannot publish prices or add a grade', async (role) => {
    signIn(role)
    const put = await prices.PUT(new Request('http://x', { method: 'PUT', body: JSON.stringify({ prices: [{ grade_id: 'g-1', price_vnd_per_kg: 15000 }] }) }), {})
    const add = await grades.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ name: 'Loại 4' }) }), {})
    expect([put.status, add.status]).toEqual([403, 403])
    expect(priceRepo.upsertPrices).not.toHaveBeenCalled()
    expect(priceRepo.createGrade).not.toHaveBeenCalled()
  })

  it('refuses a price of 0, above 10 000 000, a fraction, or two prices of one grade', async () => {
    signIn('manager')
    for (const list of [
      [{ grade_id: 'g-1', price_vnd_per_kg: 0 }],
      [{ grade_id: 'g-1', price_vnd_per_kg: 10_000_001 }],
      [{ grade_id: 'g-1', price_vnd_per_kg: 100.5 }],
      [{ grade_id: 'g-1', price_vnd_per_kg: 1 }, { grade_id: 'g-1', price_vnd_per_kg: 2 }],
      [],
    ]) {
      const res = await prices.PUT(new Request('http://x', { method: 'PUT', body: JSON.stringify({ prices: list }) }), {})
      expect(res.status).toBe(400)
    }
    expect(priceRepo.upsertPrices).not.toHaveBeenCalled()
  })

  it('publishes and returns the day', async () => {
    signIn('manager')
    const today = { date: '2026-11-28', published_at: '2026-11-28T03:00:00.000Z', prices: [] }
    priceRepo.upsertPrices.mockResolvedValue(true)
    priceRepo.pricesFor.mockResolvedValue(today)
    const res = await prices.PUT(new Request('http://x', { method: 'PUT', body: JSON.stringify({ prices: [{ grade_id: 'g-1', price_vnd_per_kg: 15000 }] }) }), {})
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: today })
  })
})

describe('withdrawal-status', () => {
  const get = (at = '') => withdrawal.GET(new Request(`http://x/api/parcels/p-1/withdrawal-status${at}`), ctx('p-1'))

  it('shows blocked with the safe day, and open when nothing blocks', async () => {
    signIn('accountant')
    fake.sprays = [spray('APPROVED', new Date(Date.now() + 3 * 86_400_000).toISOString())]
    const blocked = (await (await get()).json()).data
    expect(blocked.blocked).toBe(true)
    expect(blocked.safe_from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    fake.sprays = []
    expect((await (await get()).json()).data).toEqual({ blocked: false, safe_from: null })
  })

  it('refuses a farmer and a malformed day', async () => {
    signIn('farmer')
    expect((await get()).status).toBe(403)
    signIn('accountant')
    expect((await get('?at=tomorrow')).status).toBe(400)
  })
})

describe('GET /api/households', () => {
  it('is for accountant, manager and officer; a farmer gets 403', async () => {
    const search = jest.spyOn(fake, 'searchHouseholds').mockResolvedValue([{ id: 'h1', name: 'A', phone: '09', parcels: [{ id: 'p1', parcel_code: 'TC-A1' }] }] as never)
    for (const role of ['accountant', 'manager', 'officer']) {
      signIn(role)
      const res = await households.GET(new Request('http://x/api/households?q=a'), {})
      expect(res.status).toBe(200)
      expect((await res.json()).data[0]).toEqual({ id: 'h1', name: 'A', phone: '09', parcels: [{ id: 'p1', parcel_code: 'TC-A1' }] })
    }
    expect(search).toHaveBeenCalledWith('htx-tc', 'a')
    signIn('farmer')
    expect((await households.GET(new Request('http://x/api/households?q=a'), {})).status).toBe(403)
  })
})

describe('reads', () => {
  it('mine is for farmers only', async () => {
    for (const role of ['accountant', 'manager', 'officer']) {
      signIn(role)
      expect((await ticketsMine.GET(new Request('http://x'), {})).status).toBe(403)
    }
    signIn('farmer')
    expect((await ticketsMine.GET(new Request('http://x'), {})).status).toBe(200)
  })

  it('a farmer cannot list all tickets or export them', async () => {
    signIn('farmer')
    expect((await tickets.GET(new Request('http://x/api/leaf-tickets'), {})).status).toBe(403)
    expect((await ticketsExport.GET(new Request('http://x/api/leaf-tickets/export.csv?from=2026-11-01&to=2026-11-02'), {})).status).toBe(403)
  })

  it('a farmer sees only a ticket of their own household', async () => {
    signIn('farmer')
    jest.spyOn(fake, 'get').mockResolvedValue({ id: 't1', household_keycloak_user_id: 'someone-else' } as never)
    expect((await ticketById.GET(new Request('http://x'), ctx('t1'))).status).toBe(404)
    jest.spyOn(fake, 'get').mockResolvedValue({ id: 't1', household_keycloak_user_id: 'u1' } as never)
    const res = await ticketById.GET(new Request('http://x'), ctx('t1'))
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({ id: 't1' })
  })

  it('the CSV escapes cells that start like a formula, quotes, and adds a BOM', async () => {
    signIn('accountant')
    jest.spyOn(fake, 'listRange').mockResolvedValue([
      { ticket_no: 'TC-PC-20261128-001', weighed_at: '2026-11-28T03:00:00.000Z', household_name: '=HYPERLINK("http://evil")', parcel_code: '+A1', grade_id: 'g', grade_name: '@SUM(1)', gross_kg: 100, deduction_pct: 5, net_kg: 95, price_vnd_per_kg: 15000, amount_vnd: '1425000', status: 'VALID', void_reason: '-1+1', id: 't', household_id: 'h', parcel_id: 'p', cycle_id: null, settlement_id: null },
    ] as never)
    const res = await ticketsExport.GET(new Request('http://x/api/leaf-tickets/export.csv?from=2026-11-28&to=2026-11-28'), {})
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/csv')
    const bytes = new Uint8Array(await res.clone().arrayBuffer())
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf])
    const text = await res.text()
    expect(text).toContain('"\'=HYPERLINK(""http://evil"")"')
    expect(text).toContain('"\'+A1"')
    expect(text).toContain('"\'@SUM(1)"')
    expect(text).toContain('"\'-1+1"')
    expect(text).toContain('"1425000"')
  })

  it('refuses an export range that is reversed or longer than a year', async () => {
    signIn('manager')
    expect((await ticketsExport.GET(new Request('http://x?from=2026-11-28&to=2026-11-01'), {})).status).toBe(400)
    expect((await ticketsExport.GET(new Request('http://x?from=2024-01-01&to=2026-01-01'), {})).status).toBe(400)
    expect((await ticketsExport.GET(new Request('http://x?from=2026-02-31&to=2026-03-01'), {})).status).toBe(400)
  })
})
