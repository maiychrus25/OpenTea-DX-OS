/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// The routes run without a browser session: the session helper must never be reached.
jest.mock('@/auth', () => ({ auth: () => { throw new Error('session helper used on an internal apps route') } }))

const mockVerify = jest.fn()
jest.mock('@/infrastructure/auth/agent-token-verifier', () => ({
  KeycloakUserTokenVerifier: jest.fn().mockImplementation(() => ({ verify: (token: string) => mockVerify(token) })),
}))
const mockFindByCode = jest.fn()
jest.mock('@/infrastructure/db/farm/PrismaHtxProfileRepository', () => ({
  PrismaHtxProfileRepository: jest.fn().mockImplementation(() => ({ findByCode: (code: string) => mockFindByCode(code) })),
}))
const fake = new (jest.requireActual('../../../../__tests__/__mocks__/sales-fakes').FakeSalesPort)()
jest.mock('@/infrastructure/db/sales/PrismaSalesRepository', () => ({ PrismaSalesRepository: jest.fn(() => fake) }))

import * as lots from '@/app/api/internal/apps/sales/sellable-lots/route'
import * as retail from '@/app/api/internal/apps/sales/retail-orders/route'
import * as cancel from '@/app/api/internal/apps/sales/retail-orders/[external_ref]/cancel/route'
import { ForbiddenError, UnauthorizedError } from '@/domain/errors'
import { FakeSalesPort } from '../../../../__tests__/__mocks__/sales-fakes'

const SECRET = 'test-gateway-secret'
const call = (method: string, data?: unknown, headers: Record<string, string> = {}) =>
  new Request('http://x/api/internal/apps/sales', {
    method, body: data === undefined ? undefined : JSON.stringify(data),
    headers: { 'x-dxos-gateway': SECRET, authorization: 'Bearer tok', ...headers },
  })
const ctx = (external_ref: string) => ({ params: Promise.resolve({ external_ref }) })
const order = (ref = 'shop-1') => ({ external_ref: ref, lines: [{ lot_id: 'lot-1', pack_count: 4, pack_net_g: 250, amount_vnd: 400000 }] })

beforeEach(() => {
  process.env.DXOS_INTERNAL_GATEWAY_SECRET = SECRET
  jest.clearAllMocks()
  Object.assign(fake, new FakeSalesPort())
  mockVerify.mockResolvedValue({ sub: 'mgr-9', azp: 'nextjs-web', htxCode: 'TC', roles: ['manager'] })
  mockFindByCode.mockResolvedValue({ id: 'htx-tc' })
})

describe('internal apps sales routes', () => {
  it('draws 4 packs of 250 g as 1,000 g, then answers 200 with the same order on a replay', async () => {
    const first = await retail.POST(call('POST', order()), {})
    expect(first.status).toBe(201)
    const { data } = await first.json()
    expect(data).toMatchObject({ kind: 'RETAIL', source: 'TEA_SHOP', external_ref: 'shop-1', total_vnd: '400000' })
    expect(data.lines[0]).toMatchObject({ net_g: 1000, pack_count: 4, pack_net_g: 250 })
    const again = await retail.POST(call('POST', order()), {})
    expect(again.status).toBe(200)
    expect((await again.json()).data.id).toBe(data.id)
    expect(fake.orders).toHaveLength(1)
    expect(mockVerify).toHaveBeenCalledWith('tok')
  })

  it('answers 409 LOT_STOCK_SHORT with the stock in the error, and 422 for a lot that cannot be sold', async () => {
    fake.lots['lot-1'].kg = 0.5
    const short = await retail.POST(call('POST', order()), {})
    expect(short.status).toBe(409)
    expect(await short.json()).toEqual({ error: { code: 'LOT_STOCK_SHORT', message: expect.stringContaining('chỉ còn 0.5 kg'), stock: [{ lot_id: 'lot-1', remaining_g: 500 }] } })
    fake.lots['lot-1'].status = 'READY'
    expect((await retail.POST(call('POST', order('shop-2')), {})).status).toBe(422)
    expect((await retail.POST(call('POST', { ...order(), extra: 1 }), {})).status).toBe(400)
  })

  it('lists the sellable lots and cancels by external_ref', async () => {
    expect((await lots.GET(call('GET'), {})).status).toBe(200)
    await retail.POST(call('POST', order()), {})
    const res = await cancel.POST(call('POST', { reason: 'Khách huỷ' }), ctx('shop-1'))
    expect(res.status).toBe(200)
    expect((await res.json()).data).toMatchObject({ status: 'CANCELLED' })
    expect((await cancel.POST(call('POST', {}), ctx('nope'))).status).toBe(404)
    expect((await cancel.POST(call('POST', {}), ctx('bad ref'))).status).toBe(400)
  })

  it('refuses a call that did not come through the gateway, or has no bearer', async () => {
    expect((await lots.GET(call('GET', undefined, { 'x-dxos-gateway': 'wrong' }), {})).status).toBe(403)
    expect((await lots.GET(call('GET', undefined, { authorization: '' }), {})).status).toBe(401)
    expect(mockVerify).not.toHaveBeenCalled()
  })

  it('answers 401 for a forged token and 403 for a farmer, an officer or a service token', async () => {
    mockVerify.mockRejectedValueOnce(new UnauthorizedError('Invalid token signature'))
    expect((await retail.POST(call('POST', order()), {})).status).toBe(401)
    for (const roles of [['farmer'], ['officer'], ['accountant']]) {
      mockVerify.mockResolvedValueOnce({ sub: 'u', azp: 'nextjs-web', htxCode: 'TC', roles })
      expect((await retail.POST(call('POST', order()), {})).status).toBe(403)
    }
    mockVerify.mockRejectedValueOnce(new ForbiddenError('Service tokens are not accepted here'))
    expect((await lots.GET(call('GET'), {})).status).toBe(403)
    expect(fake.orders).toHaveLength(0)
  })

  it('answers 401 for a token of an unknown cooperative, and works only inside the token cooperative', async () => {
    mockFindByCode.mockResolvedValueOnce(null)
    expect((await lots.GET(call('GET'), {})).status).toBe(401)
    mockVerify.mockResolvedValueOnce({ sub: 'm', azp: 'nextjs-web', htxCode: 'OTHER', roles: ['manager'] })
    mockFindByCode.mockResolvedValueOnce({ id: 'htx-other' })
    // The fake lot belongs to htx-tc, so another cooperative's manager does not find it.
    expect((await retail.POST(call('POST', order()), {})).status).toBe(404)
  })
})
