// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import {
  AddPaymentUseCase, CancelOrderUseCase, CancelRetailOrderUseCase, CreateRetailOrderUseCase, CreateWholesaleOrderUseCase, UpdateDueDateUseCase,
} from '@/application/sales/SalesUseCases'
import { retailOrderSchema, wholesaleOrderSchema } from '@/lib/validations/sales.schema'
import { FakeSalesPort, NOW, accountant, manager } from '../../../../__tests__/__mocks__/sales-fakes'

const clock = () => NOW
let port: FakeSalesPort
const wholesale = (kg: number, extra: Record<string, unknown> = {}) =>
  wholesaleOrderSchema.parse({ partner_id: 'par-1', lines: [{ lot_id: 'lot-1', kg, price_vnd_per_kg: 180000 }], ...extra })
const create = (kg: number, extra?: Record<string, unknown>, actor = accountant) => new CreateWholesaleOrderUseCase(port, clock).execute(actor, wholesale(kg, extra))
const pay = (id: string, amount: number, actor = accountant) => new AddPaymentUseCase(port, clock).execute(actor, id, { amount_vnd: amount, method: 'TRANSFER' })

beforeEach(() => { port = new FakeSalesPort() })

describe('wholesale orders', () => {
  it('prices lines in grams, numbers the order and defaults the due date to 30 days', async () => {
    const order = await create(12.5)
    expect(order).toMatchObject({ order_no: 'TC-DH-20261128-001', kind: 'WHOLESALE', total_vnd: '2250000', outstanding_vnd: '2250000', due_on: '2026-12-28', overdue: false })
    expect(order.lines[0]).toMatchObject({ net_g: 12500, amount_vnd: '2250000' })
  })

  it('refuses more than the lot has with the remaining grams, and counts cancelled orders back', async () => {
    const first = await create(60)
    await expect(create(40.1)).rejects.toMatchObject({ code: 'LOT_STOCK_SHORT', details: { stock: [{ lot_id: 'lot-1', remaining_g: 40000 }] } })
    await expect(create(40)).resolves.toBeDefined()
    await new CancelOrderUseCase(port, clock).execute(manager, first.id, 'Khách đổi ý')
    await expect(create(60)).resolves.toBeDefined()
  })

  it('adds up two lines of the same lot, and refuses an unsellable or foreign lot', async () => {
    const twice = wholesaleOrderSchema.parse({ partner_id: 'par-1', lines: [{ lot_id: 'lot-1', kg: 60, price_vnd_per_kg: 1 }, { lot_id: 'lot-1', kg: 50, price_vnd_per_kg: 1 }] })
    await expect(new CreateWholesaleOrderUseCase(port, clock).execute(accountant, twice)).rejects.toMatchObject({ code: 'LOT_STOCK_SHORT' })
    port.lots['lot-2'] = { code: 'TC-L2', status: 'READY', kg: 10, htx: 'htx-tc' }
    port.lots['lot-3'] = { code: 'TC-L3', status: 'QR_EXPORTED', kg: null, htx: 'htx-tc' }
    port.lots['lot-x'] = { code: 'X-L1', status: 'QR_EXPORTED', kg: 10, htx: 'other' }
    for (const lot of ['lot-2', 'lot-3']) {
      await expect(new CreateWholesaleOrderUseCase(port, clock).execute(accountant, wholesaleOrderSchema.parse({ partner_id: 'par-1', lines: [{ lot_id: lot, kg: 1, price_vnd_per_kg: 1 }] }))).rejects.toMatchObject({ code: 'LOT_NOT_SELLABLE' })
    }
    await expect(new CreateWholesaleOrderUseCase(port, clock).execute(accountant, wholesaleOrderSchema.parse({ partner_id: 'par-1', lines: [{ lot_id: 'lot-x', kg: 1, price_vnd_per_kg: 1 }] }))).rejects.toThrow('Không tìm thấy')
    await expect(new CreateWholesaleOrderUseCase(port, clock).execute(accountant, wholesaleOrderSchema.parse({ partner_id: 'nope', lines: [{ lot_id: 'lot-1', kg: 1, price_vnd_per_kg: 1 }] }))).rejects.toThrow('Không tìm thấy')
  })

  it('validates the body strictly', () => {
    expect(() => wholesale(1.25)).toThrow()
    expect(() => wholesale(0)).toThrow()
    expect(() => wholesale(1, { due_on: '2026-11-01', ordered_on: '2026-11-02' })).toThrow()
    expect(() => wholesale(1, { extra: 1 })).toThrow()
    expect(() => wholesaleOrderSchema.parse({ partner_id: 'p', lines: [] })).toThrow()
  })
})

describe('payments, due date and cancel', () => {
  it('takes payments up to the total and answers OVERPAYMENT beyond it', async () => {
    const order = await create(10) // 1,800,000
    expect((await pay(order.id, 1_000_000)).outstanding_vnd).toBe('800000')
    await expect(pay(order.id, 800_001)).rejects.toMatchObject({ code: 'OVERPAYMENT' })
    expect((await pay(order.id, 800_000)).outstanding_vnd).toBe('0')
  })

  it('refuses payment and due-date change on a cancelled or paid order', async () => {
    const order = await create(10)
    await pay(order.id, 1_800_000)
    await expect(new UpdateDueDateUseCase(port, clock).execute(accountant, order.id, '2027-01-01')).rejects.toMatchObject({ code: 'ORDER_PAID' })
    const other = await create(10)
    await new CancelOrderUseCase(port, clock).execute(manager, other.id, 'Nhập nhầm')
    await expect(pay(other.id, 1)).rejects.toMatchObject({ code: 'ORDER_CANCELLED' })
    await expect(new UpdateDueDateUseCase(port, clock).execute(accountant, other.id, '2027-01-01')).rejects.toMatchObject({ code: 'ORDER_CANCELLED' })
  })

  it('changes the due date and flags the overdue order', async () => {
    const order = await create(10, { ordered_on: '2026-10-01', due_on: '2026-11-01' })
    expect(order.overdue).toBe(true)
    expect((await new UpdateDueDateUseCase(port, clock).execute(accountant, order.id, '2026-12-01')).overdue).toBe(false)
    await expect(new UpdateDueDateUseCase(port, clock).execute(accountant, order.id, '2026-09-30')).rejects.toThrow('Hạn thanh toán')
  })

  it('lets only a manager cancel, and not an order with a payment', async () => {
    const order = await create(10)
    await expect(new CancelOrderUseCase(port, clock).execute(accountant, order.id, 'Lý do')).rejects.toThrow('Forbidden')
    await pay(order.id, 1)
    await expect(new CancelOrderUseCase(port, clock).execute(manager, order.id, 'Lý do')).rejects.toMatchObject({ code: 'ORDER_HAS_PAYMENTS' })
    const free = await create(1)
    expect(await new CancelOrderUseCase(port, clock).execute(manager, free.id, 'Lý do')).toMatchObject({ status: 'CANCELLED', cancel_reason: 'Lý do' })
    await expect(new CancelOrderUseCase(port, clock).execute(manager, free.id, 'Lý do')).rejects.toMatchObject({ code: 'ORDER_CANCELLED' })
  })

  it('takes two parallel payments one after the other: the sum never exceeds the total', async () => {
    const order = await create(10)
    const results = await Promise.allSettled([pay(order.id, 1_000_000), pay(order.id, 1_000_000)])
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect((await port.get('htx-tc', order.id, '2026-11-28'))!.paid_vnd).toBe('1000000')
  })
})

describe('retail orders of a mini-app', () => {
  const body = (ref = 'ord-9') => retailOrderSchema.parse({ external_ref: ref, lines: [{ lot_id: 'lot-1', pack_count: 4, pack_net_g: 250, amount_vnd: 400000 }] })
  const retail = (input = body()) => new CreateRetailOrderUseCase(port, clock).execute(manager, input)

  it('draws 4 packs of 250 g as exactly 1,000 g', async () => {
    const { order, created } = await retail()
    expect(created).toBe(true)
    expect(order).toMatchObject({ kind: 'RETAIL', source: 'TEA_SHOP', external_ref: 'ord-9', partner_id: null, due_on: null, total_vnd: '400000', overdue: false })
    expect(order.lines[0]).toMatchObject({ net_g: 1000, pack_count: 4, pack_net_g: 250 })
  })

  it('answers a replay with the first order and writes nothing', async () => {
    const first = await retail()
    const again = await retail()
    expect(again.created).toBe(false)
    expect(again.order.id).toBe(first.order.id)
    expect(port.orders).toHaveLength(1)
  })

  it('refuses a stock shortfall and a non-manager, and cancels by external_ref (twice is fine)', async () => {
    await expect(new CreateRetailOrderUseCase(port, clock).execute(accountant, body())).rejects.toThrow('Forbidden')
    await retail()
    const cancel = () => new CancelRetailOrderUseCase(port, clock).execute(manager, 'ord-9', undefined)
    expect((await cancel()).status).toBe('CANCELLED')
    expect((await cancel()).status).toBe('CANCELLED')
    await expect(new CancelRetailOrderUseCase(port, clock).execute(manager, 'missing', undefined)).rejects.toThrow('Không tìm thấy')
    port.lots['lot-1'].kg = 0.5
    await expect(retail(body('ord-10'))).rejects.toMatchObject({ code: 'LOT_STOCK_SHORT', details: { stock: [{ lot_id: 'lot-1', remaining_g: 500 }] } })
  })

  it('accepts the amount as a number or a digit string and refuses a bad reference', () => {
    expect(retailOrderSchema.parse({ external_ref: 'a_1-B', lines: [{ lot_id: 'l', pack_count: 1, pack_net_g: 1, amount_vnd: '5' }] }).lines[0].amount_vnd).toBe(BigInt(5))
    expect(() => retailOrderSchema.parse({ external_ref: 'a b', lines: [{ lot_id: 'l', pack_count: 1, pack_net_g: 1, amount_vnd: 5 }] })).toThrow()
    expect(() => retailOrderSchema.parse({ external_ref: 'a', lines: [{ lot_id: 'l', pack_count: 1000, pack_net_g: 1, amount_vnd: 5 }] })).toThrow()
  })
})
