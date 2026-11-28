/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { requireTenant } from '@/lib/api/tenant'
import * as orders from '@/app/api/sales/orders/route'
import * as orderById from '@/app/api/sales/orders/[id]/route'
import * as payments from '@/app/api/sales/orders/[id]/payments/route'
import * as cancel from '@/app/api/sales/orders/[id]/cancel/route'
import * as lots from '@/app/api/sales/sellable-lots/route'
import * as receivables from '@/app/api/sales/receivables/route'
import { NotFoundError } from '@/domain/errors'
import { FakeSalesPort } from '../../../__tests__/__mocks__/sales-fakes'

const fake = new FakeSalesPort()
const guard = { salesOrder: jest.fn() }

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/tenant', () => ({ requireTenant: jest.fn() }))
jest.mock('@/lib/api/tenant-guard', () => ({ TenantGuard: jest.fn(() => guard) }))
jest.mock('@/infrastructure/db/sales/PrismaSalesRepository', () => ({ PrismaSalesRepository: jest.fn(() => fake) }))

const signIn = (role: string) => (requireTenant as jest.Mock).mockResolvedValue({ userId: `${role}-1`, role, htxCode: 'TC', htxProfileId: 'htx-tc' })
const req = (method: string, data?: unknown) => new Request('http://x/api/sales/orders', { method, body: data === undefined ? undefined : JSON.stringify(data) })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const body = (kg = 10) => ({ partner_id: 'par-1', lines: [{ lot_id: 'lot-1', kg, price_vnd_per_kg: 180000 }] })

beforeEach(() => {
  jest.clearAllMocks()
  Object.assign(fake, new FakeSalesPort())
  guard.salesOrder.mockResolvedValue(undefined)
})

describe('sales routes', () => {
  it('creates an order (201), reads it and lists it', async () => {
    signIn('accountant')
    const res = await orders.POST(req('POST', body()), {})
    expect(res.status).toBe(201)
    const { data } = await res.json()
    expect(data).toMatchObject({ total_vnd: '1800000', status: 'CONFIRMED' })
    expect((await (await orderById.GET(req('GET'), ctx(data.id))).json()).data.id).toBe(data.id)
    const list = await (await orders.GET(req('GET'), {})).json()
    expect(list).toMatchObject({ next_cursor: null })
    expect(list.data).toHaveLength(1)
  })

  it('answers 409 with the stock inside the error object, and 400 for a bad body', async () => {
    signIn('manager')
    const res = await orders.POST(req('POST', body(100.1)), {})
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: { code: 'LOT_STOCK_SHORT', message: expect.stringContaining('chỉ còn 100 kg'), stock: [{ lot_id: 'lot-1', remaining_g: 100000 }] } })
    expect((await orders.POST(req('POST', { ...body(), extra: 1 }), {})).status).toBe(400)
    expect((await orders.POST(req('POST', body(1.25)), {})).status).toBe(400)
  })

  it('takes payments (201) and refuses an overpayment (409)', async () => {
    signIn('accountant')
    const { data } = await (await orders.POST(req('POST', body()), {})).json()
    const ok = await payments.POST(req('POST', { amount_vnd: 1_000_000, method: 'CASH' }), ctx(data.id))
    expect(ok.status).toBe(201)
    expect((await ok.json()).data.outstanding_vnd).toBe('800000')
    const over = await payments.POST(req('POST', { amount_vnd: 900_000, method: 'CASH' }), ctx(data.id))
    expect(over.status).toBe(409)
    expect((await over.json()).error.code).toBe('OVERPAYMENT')
  })

  it('lets only a manager cancel; a payment blocks it', async () => {
    signIn('accountant')
    const { data } = await (await orders.POST(req('POST', body()), {})).json()
    expect((await cancel.POST(req('POST', { reason: 'Nhập nhầm' }), ctx(data.id))).status).toBe(403)
    signIn('manager')
    expect((await cancel.POST(req('POST', { reason: 'x' }), ctx(data.id))).status).toBe(400)
    expect((await cancel.POST(req('POST', { reason: 'Nhập nhầm' }), ctx(data.id))).status).toBe(200)
    expect((await cancel.POST(req('POST', { reason: 'Nhập nhầm' }), ctx(data.id))).status).toBe(409)
  })

  it('answers 404 for a foreign order and 403 for a farmer or officer', async () => {
    signIn('manager')
    guard.salesOrder.mockRejectedValue(new NotFoundError('Resource not found'))
    expect((await orderById.GET(req('GET'), ctx('x'))).status).toBe(404)
    expect((await orderById.PATCH(req('PATCH', { due_on: '2026-12-01' }), ctx('x'))).status).toBe(404)
    for (const role of ['farmer', 'officer']) {
      signIn(role)
      expect((await orders.GET(req('GET'), {})).status).toBe(403)
      expect((await lots.GET(req('GET'), {})).status).toBe(403)
      expect((await receivables.GET(req('GET'), {})).status).toBe(403)
    }
  })

  it('changes the due date of a wholesale order', async () => {
    signIn('accountant')
    const { data } = await (await orders.POST(req('POST', body()), {})).json()
    const res = await orderById.PATCH(req('PATCH', { due_on: '2027-01-15' }), ctx(data.id))
    expect(res.status).toBe(200)
    expect((await res.json()).data.due_on).toBe('2027-01-15')
    expect((await orderById.PATCH(req('PATCH', { due_on: 'soon' }), ctx(data.id))).status).toBe(400)
  })
})
