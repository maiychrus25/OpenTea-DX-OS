/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { requireTenant } from '@/lib/api/tenant'
import * as periods from '@/app/api/settlements/route'
import * as periodById from '@/app/api/settlements/[id]/route'
import * as closeRoute from '@/app/api/settlements/[id]/close/route'
import * as payoutRoute from '@/app/api/settlements/[id]/lines/[lineId]/payout/route'
import * as slipRoute from '@/app/api/settlements/[id]/lines/[lineId]/slip/route'
import * as adjustments from '@/app/api/ledger/adjustments/route'
import { NotFoundError } from '@/domain/errors'
import { FakeSettlementPort } from '../../../__tests__/__mocks__/settlement-fakes'

const fake = new FakeSettlementPort()
const guard = { household: jest.fn() }

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/tenant', () => ({ requireTenant: jest.fn() }))
jest.mock('@/lib/api/tenant-guard', () => ({ TenantGuard: jest.fn(() => guard) }))
jest.mock('@/infrastructure/db/ledger/PrismaSettlementRepository', () => ({ PrismaSettlementRepository: jest.fn(() => fake) }))

const signIn = (role: string) => (requireTenant as jest.Mock).mockResolvedValue({ userId: `${role}-1`, role, htxCode: 'TC', htxProfileId: 'htx-tc', userName: role })
const req = (method: string, data?: unknown) => new Request('http://x', { method, body: data === undefined ? undefined : JSON.stringify(data) })
const ctx = (id: string, lineId?: string) => ({ params: Promise.resolve({ id, lineId }) })
const yesterday = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)

beforeEach(() => {
  jest.clearAllMocks()
  Object.assign(fake, new FakeSettlementPort())
  guard.household.mockResolvedValue(undefined)
})

describe('settlement routes', () => {
  it('creates a draft period (201), lists it and reads it with totals', async () => {
    signIn('accountant')
    const res = await periods.POST(req('POST', { date_from: yesterday(), date_to: yesterday() }), {})
    expect(res.status).toBe(201)
    const { data } = await res.json()
    expect(data).toMatchObject({ status: 'DRAFT', created_by_name: 'accountant' })
    expect((await (await periods.GET(req('GET'), {})).json()).data).toHaveLength(1)
    const detail = (await (await periodById.GET(req('GET'), ctx(data.id))).json()).data
    expect(detail.totals).toEqual({ households: 0, leaf_amount_vnd: '0', advances_vnd: '0', payable_vnd: '0', debt_out_vnd: '0' })
  })

  it('answers 422 for a period that ends in the future and 400 for a bad body', async () => {
    signIn('accountant')
    const res = await periods.POST(req('POST', { date_from: '2999-01-01', date_to: '2999-01-02' }), {})
    expect(res.status).toBe(422)
    expect((await periods.POST(req('POST', { date_from: '2026-11-03', date_to: '2026-11-02' }), {})).status).toBe(400)
    expect((await periods.POST(req('POST', { date_from: '2026-11-01', date_to: '2026-11-02', extra: 1 }), {})).status).toBe(400)
    signIn('farmer')
    expect((await periods.POST(req('POST', { date_from: yesterday(), date_to: yesterday() }), {})).status).toBe(403)
    expect((await periods.GET(req('GET'), {})).status).toBe(403)
  })

  it('lets only a manager close; the accountant gets 403 and the draft stays', async () => {
    fake.ticket('hh-1', yesterday(), 100_000)
    signIn('accountant')
    const { data } = await (await periods.POST(req('POST', { date_from: yesterday(), date_to: yesterday() }), {})).json()
    const body = { expected_household_count: 1, expected_payable_total_vnd: '100000' }
    expect((await closeRoute.POST(req('POST', body), ctx(data.id))).status).toBe(403)
    signIn('manager')
    expect((await closeRoute.POST(req('POST', { ...body, expected_payable_total_vnd: '1.5' }), ctx(data.id))).status).toBe(400)
    const stale = await closeRoute.POST(req('POST', { ...body, expected_household_count: 2 }), ctx(data.id))
    expect(stale.status).toBe(409)
    expect((await stale.json()).error).toMatchObject({ code: 'PERIOD_CHANGED', totals: { households: 1, payable_vnd: '100000' } })
    const ok = await closeRoute.POST(req('POST', body), ctx(data.id))
    expect(ok.status).toBe(200)
    expect((await ok.json()).data.period.status).toBe('CLOSED')
    const again = await closeRoute.POST(req('POST', body), ctx(data.id))
    expect(again.status).toBe(409)
    expect((await again.json()).error.code).toBe('PERIOD_CLOSED')
    expect((await closeRoute.POST(req('POST', body), ctx('other-htx-period'))).status).toBe(404)
  })

  it('pays a line once (200, then 409) and refuses a farmer', async () => {
    fake.ticket('hh-1', yesterday(), 100_000)
    signIn('manager')
    const { data: period } = await (await periods.POST(req('POST', { date_from: yesterday(), date_to: yesterday() }), {})).json()
    const closed = (await (await closeRoute.POST(req('POST', { expected_household_count: 1, expected_payable_total_vnd: '100000' }), ctx(period.id))).json()).data
    const lineId = closed.lines[0].id
    signIn('farmer')
    expect((await payoutRoute.POST(req('POST', { method: 'CASH' }), ctx(period.id, lineId))).status).toBe(403)
    signIn('accountant')
    expect((await payoutRoute.POST(req('POST', { method: 'BANK' }), ctx(period.id, lineId))).status).toBe(400)
    const paid = await payoutRoute.POST(req('POST', { method: 'CASH', ref: 'Biên nhận 7' }), ctx(period.id, lineId))
    expect(paid.status).toBe(200)
    expect((await paid.json()).data).toMatchObject({ payment_method: 'CASH', payment_ref: 'Biên nhận 7', period_id: period.id })
    const second = await payoutRoute.POST(req('POST', { method: 'CASH' }), ctx(period.id, lineId))
    expect(second.status).toBe(409)
    expect((await second.json()).error.code).toBe('ALREADY_PAID')
  })

  it('answers 404 for a slip that does not exist and 403 for an officer', async () => {
    signIn('accountant')
    expect((await slipRoute.GET(req('GET'), ctx('p-1', 'l-1'))).status).toBe(404)
    signIn('officer')
    expect((await slipRoute.GET(req('GET'), ctx('p-1', 'l-1'))).status).toBe(403)
  })

  it('books an adjustment for a manager only, with a reason', async () => {
    const body = { household_id: 'hh-1', amount_vnd: '-100000', reason: 'Sửa nhầm số' }
    signIn('accountant')
    expect((await adjustments.POST(req('POST', body), {})).status).toBe(403)
    signIn('manager')
    const res = await adjustments.POST(req('POST', body), {})
    expect(res.status).toBe(201)
    expect((await res.json()).data).toMatchObject({ entry_type: 'ADJUSTMENT', amount_vnd: '-100000' })
    for (const bad of [{ reason: 'ngắn' }, { amount_vnd: '0' }, { amount_vnd: '1.5' }, { amount_vnd: '-0' }]) {
      expect((await adjustments.POST(req('POST', { ...body, ...bad }), {})).status).toBe(400)
    }
    guard.household.mockRejectedValueOnce(new NotFoundError('Resource not found'))
    expect((await adjustments.POST(req('POST', body), {})).status).toBe(404)
  })
})
