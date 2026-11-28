/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Runs against a throwaway Postgres with every migration applied, and only when SALES_TEST_DATABASE_URL is set:
//   SALES_TEST_DATABASE_URL=postgresql://... npx jest src/__tests__/db/sales-postgres.integration.test.ts
// It never runs in the normal suite, which has no database.

export {} // a module of its own: `url` and `maybe` do not clash with the other database tests

const url = process.env.SALES_TEST_DATABASE_URL
const maybe = url ? describe : describe.skip

maybe('sales on a real Postgres', () => {
  let prisma: import('@prisma/client').PrismaClient
  let uc: typeof import('@/application/sales/SalesUseCases')
  let port: import('@/infrastructure/db/sales/PrismaSalesRepository').PrismaSalesRepository
  const run = String(Date.now())
  const htxCode = `S${run.slice(-5)}`
  let htxId = ''
  let partnerId = ''
  const actor = (role = 'manager') => ({ userId: `${role}-1`, role, htxProfileId: htxId, htxCode })
  const lotOf = async (kg: number | null, status: 'QR_EXPORTED' | 'READY' = 'QR_EXPORTED', name = Math.random().toString(36).slice(2, 8)) =>
    (await prisma.lot.create({ data: { lot_code: `${htxCode}-${name}`, commodity: 'tea', harvest_date: new Date(), total_weight_kg: kg, status, htx_profile_id: htxId } })).id
  const wholesale = (lotId: string, kg: number, partner = partnerId) => ({ partner_id: partner, lines: [{ lot_id: lotId, kg, price_vnd_per_kg: 180000 }] })
  const create = (lotId: string, kg: number, partner?: string) => new uc.CreateWholesaleOrderUseCase(port).execute(actor('accountant'), wholesale(lotId, kg, partner))
  const remaining = async (lotId: string) => (await port.sellableLots(htxId)).find((l) => l.lot_id === lotId)?.remaining_g ?? 0

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    ;({ prisma } = require('@/infrastructure/db/prisma.client'))
    uc = require('@/application/sales/SalesUseCases')
    port = new (require('@/infrastructure/db/sales/PrismaSalesRepository').PrismaSalesRepository)()
    htxId = (await prisma.htxProfile.create({ data: { name: 'HTX thử', address: 'x', crop_types: [], htx_code: htxCode } })).id
    const partner = { partner_type: 'BUYER' as const, primary_commodities: [], lat: 0, lng: 0, htx_profile_id: htxId }
    partnerId = (await prisma.partner.create({ data: { ...partner, name: 'Thương lái A' } })).id
  })

  afterAll(async () => { await prisma.$disconnect() })

  it('lets only what the lot holds be sold when many orders race: never below zero', async () => {
    const lot = await lotOf(10)
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => create(lot, 2)))
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5)
    const refused = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    expect(refused).toHaveLength(3)
    for (const r of refused) expect(r.reason).toMatchObject({ code: 'LOT_STOCK_SHORT', details: { stock: [{ lot_id: lot }] } })
    expect(await remaining(lot)).toBe(0)
    const sold = await prisma.salesOrderLine.aggregate({ where: { lot_id: lot, order: { status: 'CONFIRMED' } }, _sum: { net_g: true } })
    expect(sold._sum.net_g).toBe(10000)
  })

  it('numbers parallel orders without a gap or a duplicate', async () => {
    const lot = await lotOf(100)
    const made = await Promise.all(Array.from({ length: 6 }, () => create(lot, 1)))
    const numbers = made.map((o) => o.order_no).sort()
    expect(new Set(numbers).size).toBe(6)
    const first = Number(numbers[0].slice(-3))
    expect(numbers.map((n) => Number(n.slice(-3)))).toEqual([0, 1, 2, 3, 4, 5].map((i) => first + i))
  })

  it('takes two payments at once: the sum never exceeds the total', async () => {
    const lot = await lotOf(100)
    const order = await create(lot, 10) // 1,800,000
    const pay = (amount: number) => new uc.AddPaymentUseCase(port).execute(actor('accountant'), order.id, { amount_vnd: amount, method: 'TRANSFER' })
    const results = await Promise.allSettled([pay(1_000_000), pay(1_000_000)])
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ code: 'OVERPAYMENT' })
    const paid = await prisma.salesPayment.aggregate({ where: { order_id: order.id }, _sum: { amount_vnd: true } })
    expect(paid._sum.amount_vnd).toBe(BigInt(1_000_000))
    expect((await new uc.GetSalesOrderUseCase(port).execute(actor(), order.id)).outstanding_vnd).toBe('800000')
  })

  it('refuses to cancel a paid order, and gives the stock back when an unpaid one is cancelled', async () => {
    const lot = await lotOf(10)
    const paid = await create(lot, 4)
    await new uc.AddPaymentUseCase(port).execute(actor('accountant'), paid.id, { amount_vnd: 1, method: 'CASH' })
    await expect(new uc.CancelOrderUseCase(port).execute(actor(), paid.id, 'Nhập nhầm')).rejects.toMatchObject({ code: 'ORDER_HAS_PAYMENTS' })
    const free = await create(lot, 6)
    expect(await remaining(lot)).toBe(0)
    await new uc.CancelOrderUseCase(port).execute(actor(), free.id, 'Nhập nhầm')
    expect(await remaining(lot)).toBe(6000)
  })

  it('keeps payments append-only in the database', async () => {
    const lot = await lotOf(10)
    const order = await create(lot, 1)
    await new uc.AddPaymentUseCase(port).execute(actor(), order.id, { amount_vnd: 5, method: 'CASH' })
    await expect(prisma.salesPayment.updateMany({ where: { order_id: order.id }, data: { amount_vnd: BigInt(1) } })).rejects.toThrow(/append-only/)
    await expect(prisma.salesPayment.deleteMany({ where: { order_id: order.id } })).rejects.toThrow(/append-only/)
    await expect(prisma.$executeRawUnsafe('TRUNCATE sales_payments')).rejects.toThrow(/append-only/)
  })

  it('writes one retail order for a replayed external_ref, even when the calls race', async () => {
    const lot = await lotOf(10)
    const input = { external_ref: `shop-${run}`, lines: [{ lot_id: lot, pack_count: 4, pack_net_g: 250, amount_vnd: BigInt(400000) }] }
    const results = await Promise.all([1, 2, 3].map(() => new uc.CreateRetailOrderUseCase(port).execute(actor(), input)))
    expect(results.filter((r) => r.created)).toHaveLength(1)
    expect(new Set(results.map((r) => r.order.id)).size).toBe(1)
    expect(results[0].order.lines[0]).toMatchObject({ net_g: 1000, pack_count: 4, pack_net_g: 250 })
    expect(await prisma.salesOrder.count({ where: { htx_profile_id: htxId, external_ref: input.external_ref } })).toBe(1)
    expect(await remaining(lot)).toBe(9000)
    await new uc.CancelRetailOrderUseCase(port).execute(actor(), input.external_ref, undefined)
    expect(await remaining(lot)).toBe(10000)
  })

  it('shows only sellable lots with something left, and refuses the others', async () => {
    const ready = await lotOf(10, 'READY')
    const noWeight = await lotOf(null)
    const open = await lotOf(1)
    const ids = (await port.sellableLots(htxId)).map((l) => l.lot_id)
    expect(ids).toContain(open)
    expect(ids).not.toContain(ready)
    expect(ids).not.toContain(noWeight)
    await expect(create(ready, 1)).rejects.toMatchObject({ code: 'LOT_NOT_SELLABLE' })
    await expect(create(noWeight, 1)).rejects.toMatchObject({ code: 'LOT_NOT_SELLABLE' })
  })

  it('counts receivables as orders minus payments, by partner, overdue by the due date', async () => {
    const lot = await lotOf(1000)
    const newPartner = async (name: string) => (await prisma.partner.create({ data: { name, partner_type: 'BUYER', primary_commodities: [], lat: 0, lng: 0, htx_profile_id: htxId } })).id
    const partnerId = await newPartner('Nợ A')
    const otherPartnerId = await newPartner('Nợ B')
    const wholesaleOf = (kg: number, partner = partnerId) => wholesale(lot, kg, partner)
    const create = (kg: number, partner = partnerId) => new uc.CreateWholesaleOrderUseCase(port).execute(actor(), wholesaleOf(kg, partner))
    const before = await new uc.ReadReceivablesUseCase(port).execute(actor())
    const a1 = await new uc.CreateWholesaleOrderUseCase(port).execute(actor(), { ...wholesaleOf(10), ordered_on: '2020-01-01', due_on: '2020-02-01' }) // 1,800,000 overdue
    const a2 = await create(5) // 900,000 not due
    await create(20, otherPartnerId) // 3,600,000
    await new uc.AddPaymentUseCase(port).execute(actor(), a1.id, { amount_vnd: 300_000, method: 'CASH' })
    const done = await create(1, otherPartnerId)
    await new uc.AddPaymentUseCase(port).execute(actor(), done.id, { amount_vnd: 180_000, method: 'CASH' }) // paid in full: not listed
    const summary = await new uc.ReadReceivablesUseCase(port).execute(actor('accountant'))
    expect(BigInt(summary.outstanding_vnd) - BigInt(before.outstanding_vnd)).toBe(BigInt(1_500_000 + 900_000 + 3_600_000))
    expect(summary.overdue_count - before.overdue_count).toBe(1)
    expect(BigInt(summary.overdue_vnd) - BigInt(before.overdue_vnd)).toBe(BigInt(1_500_000))
    expect(summary.partners.filter((p) => p.partner_name.startsWith('Nợ ')).map((p) => [p.partner_name, p.outstanding_vnd, p.overdue_vnd])).toEqual([['Nợ B', '3600000', '0'], ['Nợ A', '2400000', '1500000']])
    const amounts = summary.partners.map((p) => BigInt(p.outstanding_vnd))
    expect(amounts).toEqual([...amounts].sort((x, y) => (x < y ? 1 : x > y ? -1 : 0)))
    const overdue = await new uc.ListSalesOrdersUseCase(port).execute(actor(), { overdue: true, partnerId })
    expect(overdue.data.map((o) => o.id)).toEqual([a1.id])
    expect(a2.overdue).toBe(false)
    const byPartner = await new uc.ListSalesOrdersUseCase(port).execute(actor(), { partnerId: otherPartnerId })
    expect(byPartner.data.every((o) => o.partner_id === otherPartnerId)).toBe(true)
  })

  it('feeds the director board the same receivables', async () => {
    const { PrismaBoardSource } = require('@/infrastructure/db/board/PrismaBoardSource')
    const board = await new (require('@/application/board/DirectorBoardUseCase').DirectorBoardUseCase)(new PrismaBoardSource()).read(htxId, new Date(), 'accountant')
    const direct = await port.receivables(htxId, board.today)
    expect(board.receivables).toMatchObject({ outstanding_vnd: direct.outstanding_vnd, overdue_count: direct.overdue_count, overdue_vnd: direct.overdue_vnd })
    expect(board.receivables.top.length).toBeLessThanOrEqual(3)
    expect(board.alerts.some((a: { kind: string }) => a.kind === 'ORDERS_OVERDUE')).toBe(direct.overdue_count > 0)
  })

  it('audits the writes with the person who acted', async () => {
    const lot = await lotOf(10)
    const order = await create(lot, 1)
    const rows = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM audit.events WHERE row_id = ${order.id} AND table_name = 'sales_orders' AND actor = 'user:accountant-1'`
    expect(rows[0].n).toBeGreaterThan(0)
  })
})
