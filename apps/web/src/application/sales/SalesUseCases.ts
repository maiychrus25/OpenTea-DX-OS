// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ConflictError, ForbiddenError, NotFoundError, UnprocessableError, ValidationError } from '@/domain/errors'
import type { NewOrderLine, SalesListFilter, SalesPort, SalesUnit } from '@/domain/sales/ports/SalesPort'
import { kgToG, lineAmount } from '@/domain/sales/math'
import type { ReceivablesSummary, SalesKind, SalesOrderView, SalesSource, SellableLot } from '@/domain/sales/views'
import { vnDayOf } from '@/application/agent/campaign/vn-day'
import type { RetailOrderInput, WholesaleOrderInput } from '@/lib/validations/sales.schema'

export interface SalesActor {
  userId: string
  role: string
  htxProfileId: string
  htxCode: string
}

type Clock = () => Date

const isStaff = (actor: SalesActor) => actor.role === 'manager' || actor.role === 'accountant'
const requireStaff = (actor: SalesActor) => { if (!isStaff(actor)) throw new ForbiddenError('Forbidden') }
const requireManager = (actor: SalesActor) => { if (actor.role !== 'manager') throw new ForbiddenError('Forbidden') }
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const kgText = (grams: number) => String(grams / 1000)
const ctx = (actor: SalesActor) => ({ htxProfileId: actor.htxProfileId, htxCode: actor.htxCode, actorId: actor.userId })

interface OrderSpec {
  kind: SalesKind
  source: SalesSource
  externalRef: string | null
  partnerId: string | null
  customerName: string | null
  orderedOn: string
  dueOn: string | null
  note: string | null
  lines: NewOrderLine[]
}

/** One transaction body: lock the lots, check each is sellable and has enough left, number the order and write it. */
async function placeOrder(unit: SalesUnit, actor: SalesActor, spec: OrderSpec, today: string): Promise<SalesOrderView> {
  const wanted = new Map<string, number>()
  for (const line of spec.lines) wanted.set(line.lot_id, (wanted.get(line.lot_id) ?? 0) + line.net_g)

  const stock = new Map((await unit.lockLots(actor.htxProfileId, Array.from(wanted.keys()))).map((lot) => [lot.lot_id, lot]))
  for (const id of Array.from(wanted.keys())) if (!stock.has(id)) throw new NotFoundError('Không tìm thấy lô')

  const unsellable = Array.from(stock.values()).find((lot) => !lot.qr_exported || lot.capacity_g === null)
  if (unsellable) throw new UnprocessableError('LOT_NOT_SELLABLE', `Lô ${unsellable.lot_code} chưa xuất QR hoặc chưa có khối lượng nên chưa bán được.`, { lot_id: unsellable.lot_id })

  const short = Array.from(wanted).flatMap(([id, grams]) => {
    const lot = stock.get(id)!
    const remaining = lot.capacity_g! - lot.sold_g
    return remaining < grams ? [{ lot_id: id, lot_code: lot.lot_code, remaining_g: Math.max(0, remaining) }] : []
  })
  if (short.length > 0) {
    const first = short[0]
    throw new ConflictError('LOT_STOCK_SHORT', `Lô ${first.lot_code} chỉ còn ${kgText(first.remaining_g)} kg, không đủ cho đơn này.`, {
      stock: short.map(({ lot_id, remaining_g }) => ({ lot_id, remaining_g })),
    })
  }

  const orderNo = await unit.nextOrderNo(actor.htxCode, spec.orderedOn)
  const id = await unit.insertOrder({
    htxProfileId: actor.htxProfileId,
    orderNo,
    kind: spec.kind,
    source: spec.source,
    externalRef: spec.externalRef,
    partnerId: spec.partnerId,
    customerName: spec.customerName,
    orderedOn: spec.orderedOn,
    dueOn: spec.dueOn,
    totalVnd: spec.lines.reduce((sum, line) => sum + line.amount_vnd, BigInt(0)),
    note: spec.note,
    createdById: actor.userId,
    lines: spec.lines,
  })
  return unit.view(id, today)
}

export class ListSellableLotsUseCase {
  constructor(private readonly port: SalesPort) {}

  async execute(actor: SalesActor): Promise<SellableLot[]> {
    requireStaff(actor)
    return this.port.sellableLots(actor.htxProfileId)
  }
}

export class ListSalesOrdersUseCase {
  constructor(private readonly port: SalesPort, private readonly clock: Clock = () => new Date()) {}

  async execute(actor: SalesActor, filter: Omit<SalesListFilter, 'htxProfileId' | 'today'>) {
    requireStaff(actor)
    return this.port.list({ ...filter, htxProfileId: actor.htxProfileId, today: vnDayOf(this.clock()) })
  }
}

export class GetSalesOrderUseCase {
  constructor(private readonly port: SalesPort, private readonly clock: Clock = () => new Date()) {}

  async execute(actor: SalesActor, id: string): Promise<SalesOrderView> {
    requireStaff(actor)
    const order = await this.port.get(actor.htxProfileId, id, vnDayOf(this.clock()))
    if (!order) throw new NotFoundError('Không tìm thấy đơn bán')
    return order
  }
}

export class CreateWholesaleOrderUseCase {
  constructor(private readonly port: SalesPort, private readonly clock: Clock = () => new Date()) {}

  async execute(actor: SalesActor, input: WholesaleOrderInput): Promise<SalesOrderView> {
    requireStaff(actor)
    const today = vnDayOf(this.clock())
    const orderedOn = input.ordered_on ?? today
    const dueOn = input.due_on ?? addDays(orderedOn, 30)
    if (dueOn < orderedOn) throw new ValidationError('Hạn thanh toán không được trước ngày đặt')
    const lines = input.lines.map((line): NewOrderLine => {
      const grams = kgToG(line.kg)
      return { lot_id: line.lot_id, net_g: grams, pack_count: null, pack_net_g: null, price_vnd_per_kg: line.price_vnd_per_kg, amount_vnd: lineAmount(grams, line.price_vnd_per_kg) }
    })
    return this.port.inTransaction(ctx(actor), async (unit) => {
      if (!(await unit.partnerExists(actor.htxProfileId, input.partner_id))) throw new NotFoundError('Không tìm thấy thương lái')
      return placeOrder(unit, actor, {
        kind: 'WHOLESALE', source: 'CORE', externalRef: null, partnerId: input.partner_id, customerName: null,
        orderedOn, dueOn, note: input.note ?? null, lines,
      }, today)
    })
  }
}

/** A retail order of a mini-app. A replay of the same `external_ref` answers with the first order and writes nothing. */
export class CreateRetailOrderUseCase {
  constructor(private readonly port: SalesPort, private readonly clock: Clock = () => new Date()) {}

  async execute(actor: SalesActor, input: RetailOrderInput): Promise<{ order: SalesOrderView; created: boolean }> {
    requireManager(actor)
    const today = vnDayOf(this.clock())
    const lines = input.lines.map((line): NewOrderLine => ({
      lot_id: line.lot_id, net_g: line.pack_count * line.pack_net_g, pack_count: line.pack_count, pack_net_g: line.pack_net_g, price_vnd_per_kg: null, amount_vnd: line.amount_vnd,
    }))
    return this.port.inTransaction(ctx(actor), async (unit) => {
      await unit.lockExternalRef(actor.htxCode, input.external_ref)
      const existing = await unit.findByExternalRef(actor.htxProfileId, 'TEA_SHOP', input.external_ref)
      if (existing) return { order: await unit.view(existing, today), created: false }
      const order = await placeOrder(unit, actor, {
        kind: 'RETAIL', source: 'TEA_SHOP', externalRef: input.external_ref, partnerId: null, customerName: input.customer_name ?? null,
        orderedOn: today, dueOn: null, note: null, lines,
      }, today)
      return { order, created: true }
    })
  }
}

export class UpdateDueDateUseCase {
  constructor(private readonly port: SalesPort, private readonly clock: Clock = () => new Date()) {}

  async execute(actor: SalesActor, id: string, dueOn: string): Promise<SalesOrderView> {
    requireStaff(actor)
    const today = vnDayOf(this.clock())
    return this.port.inTransaction(ctx(actor), async (unit) => {
      const order = await unit.lockOrder(actor.htxProfileId, id)
      if (!order) throw new NotFoundError('Không tìm thấy đơn bán')
      if (order.kind !== 'WHOLESALE') throw new UnprocessableError('NOT_WHOLESALE', 'Chỉ đơn bán sỉ mới có hạn thanh toán.')
      if (order.status === 'CANCELLED') throw new ConflictError('ORDER_CANCELLED', 'Đơn này đã huỷ.')
      if (order.paid_vnd >= order.total_vnd) throw new ConflictError('ORDER_PAID', 'Đơn này đã thu đủ tiền.')
      if (dueOn < order.ordered_on) throw new ValidationError('Hạn thanh toán không được trước ngày đặt')
      await unit.setDueOn(id, dueOn)
      return unit.view(id, today)
    })
  }
}

export class AddPaymentUseCase {
  constructor(private readonly port: SalesPort, private readonly clock: Clock = () => new Date()) {}

  async execute(actor: SalesActor, id: string, input: { amount_vnd: number | string; paid_on?: string; method: 'TRANSFER' | 'CASH'; ref?: string }): Promise<SalesOrderView> {
    requireStaff(actor)
    const today = vnDayOf(this.clock())
    const amount = BigInt(input.amount_vnd)
    return this.port.inTransaction(ctx(actor), async (unit) => {
      // The row lock decides: of two payments at once, the second sees the first and may be refused.
      const order = await unit.lockOrder(actor.htxProfileId, id)
      if (!order) throw new NotFoundError('Không tìm thấy đơn bán')
      if (order.status === 'CANCELLED') throw new ConflictError('ORDER_CANCELLED', 'Đơn này đã huỷ.')
      const outstanding = order.total_vnd - order.paid_vnd
      if (amount > outstanding) throw new ConflictError('OVERPAYMENT', 'Số tiền thu vượt quá số còn phải thu của đơn.', { outstanding_vnd: outstanding.toString() })
      await unit.insertPayment({ orderId: id, amountVnd: amount, paidOn: input.paid_on ?? today, method: input.method, ref: input.ref ?? null, createdById: actor.userId })
      return unit.view(id, today)
    })
  }
}

/** Cancels one order under its row lock. A payment on the order refuses it. */
async function cancelLocked(unit: SalesUnit, actor: SalesActor, id: string, reason: string, at: Date, today: string): Promise<SalesOrderView> {
  const order = await unit.lockOrder(actor.htxProfileId, id)
  if (!order) throw new NotFoundError('Không tìm thấy đơn bán')
  if (order.status === 'CANCELLED') throw new ConflictError('ORDER_CANCELLED', 'Đơn này đã huỷ.')
  if (order.paid_vnd > BigInt(0)) throw new ConflictError('ORDER_HAS_PAYMENTS', 'Đơn đã có tiền thu nên không huỷ được.')
  await unit.cancelOrder({ id, by: actor.userId, at, reason })
  return unit.view(id, today)
}

export class CancelOrderUseCase {
  constructor(private readonly port: SalesPort, private readonly clock: Clock = () => new Date()) {}

  async execute(actor: SalesActor, id: string, reason: string): Promise<SalesOrderView> {
    requireManager(actor)
    const now = this.clock()
    return this.port.inTransaction(ctx(actor), (unit) => cancelLocked(unit, actor, id, reason, now, vnDayOf(now)))
  }
}

/** Cancels a mini-app retail order by its `external_ref`. Cancelling twice answers with the cancelled order. */
export class CancelRetailOrderUseCase {
  constructor(private readonly port: SalesPort, private readonly clock: Clock = () => new Date()) {}

  async execute(actor: SalesActor, externalRef: string, reason: string | undefined): Promise<SalesOrderView> {
    requireManager(actor)
    const now = this.clock()
    const today = vnDayOf(now)
    return this.port.inTransaction(ctx(actor), async (unit) => {
      await unit.lockExternalRef(actor.htxCode, externalRef)
      const id = await unit.findByExternalRef(actor.htxProfileId, 'TEA_SHOP', externalRef)
      if (!id) throw new NotFoundError('Không tìm thấy đơn bán')
      const order = await unit.lockOrder(actor.htxProfileId, id)
      if (order?.status === 'CANCELLED') return unit.view(id, today)
      return cancelLocked(unit, actor, id, reason ?? 'Huỷ từ gian hàng', now, today)
    })
  }
}

export class ReadReceivablesUseCase {
  constructor(private readonly port: SalesPort, private readonly clock: Clock = () => new Date()) {}

  async execute(actor: SalesActor): Promise<ReceivablesSummary> {
    requireStaff(actor)
    return this.port.receivables(actor.htxProfileId, vnDayOf(this.clock()))
  }
}
