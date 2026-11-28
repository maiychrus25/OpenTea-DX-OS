// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { LockedOrder, LotStock, NewOrder, NewPayment, SalesPort, SalesUnit } from '@/domain/sales/ports/SalesPort'
import type { ReceivablesSummary, SalesOrderView, SellableLot } from '@/domain/sales/views'

export const NOW = new Date('2026-11-28T03:00:00Z') // 10:00 on 2026-11-28 in Vietnam
export const manager = { userId: 'mgr-1', role: 'manager', htxProfileId: 'htx-tc', htxCode: 'TC' }
export const accountant = { ...manager, userId: 'acc-1', role: 'accountant' }

interface Order extends NewOrder { id: string; status: 'CONFIRMED' | 'CANCELLED'; cancelReason: string | null; payments: NewPayment[] }

/** An in-memory sales port: transactions run one at a time, and one that throws leaves nothing behind. */
export class FakeSalesPort implements SalesPort {
  lots: Record<string, { code: string; status: string; kg: number | null; htx: string }> = { 'lot-1': { code: 'TC-L1', status: 'QR_EXPORTED', kg: 100, htx: 'htx-tc' } }
  partners: Record<string, string> = { 'par-1': 'Thương lái A' }
  orders: Order[] = []
  private tail: Promise<unknown> = Promise.resolve()
  private seq = 0

  private soldG(lotId: string) {
    return this.orders.filter((o) => o.status === 'CONFIRMED').flatMap((o) => o.lines).filter((l) => l.lot_id === lotId).reduce((s, l) => s + l.net_g, 0)
  }

  private toView(o: Order, today: string): SalesOrderView {
    const paid = o.payments.reduce((s, p) => s + p.amountVnd, BigInt(0))
    const outstanding = o.totalVnd - paid
    return {
      id: o.id, order_no: o.orderNo, kind: o.kind, source: o.source, external_ref: o.externalRef, partner_id: o.partnerId, partner_name: o.partnerId ? this.partners[o.partnerId] : null,
      customer_name: o.customerName, ordered_on: o.orderedOn, due_on: o.dueOn, status: o.status, total_vnd: o.totalVnd.toString(), paid_vnd: paid.toString(), outstanding_vnd: outstanding.toString(),
      overdue: o.kind === 'WHOLESALE' && o.status === 'CONFIRMED' && outstanding > BigInt(0) && o.dueOn !== null && o.dueOn < today, note: o.note, created_at: NOW.toISOString(),
      cancelled_at: null, cancel_reason: o.cancelReason,
      lines: o.lines.map((l, i) => ({ id: `${o.id}-l${i}`, lot_id: l.lot_id, lot_code: this.lots[l.lot_id].code, net_g: l.net_g, pack_count: l.pack_count, pack_net_g: l.pack_net_g, price_vnd_per_kg: l.price_vnd_per_kg, amount_vnd: l.amount_vnd.toString() })),
      payments: o.payments.map((p, i) => ({ id: `${o.id}-p${i}`, amount_vnd: p.amountVnd.toString(), paid_on: p.paidOn, method: p.method, ref: p.ref, created_at: NOW.toISOString() })),
    }
  }

  private unit(): SalesUnit {
    return {
      partnerExists: async (_htx, id) => id in this.partners,
      lockLots: async (htx, ids): Promise<LotStock[]> => ids.filter((id) => this.lots[id]?.htx === htx).sort().map((id) => {
        const l = this.lots[id]
        return { lot_id: id, lot_code: l.code, qr_exported: l.status === 'QR_EXPORTED', capacity_g: l.kg === null ? null : Math.round(l.kg * 1000), sold_g: this.soldG(id) }
      }),
      nextOrderNo: async (code, day) => `${code}-DH-${day.replace(/-/g, '')}-${String(this.orders.filter((o) => o.orderedOn === day).length + 1).padStart(3, '0')}`,
      lockExternalRef: async () => undefined,
      findByExternalRef: async (_htx, source, ref) => this.orders.find((o) => o.source === source && o.externalRef === ref)?.id ?? null,
      insertOrder: async (o) => { const id = `ord-${++this.seq}`; this.orders.push({ ...o, id, status: 'CONFIRMED', cancelReason: null, payments: [] }); return id },
      lockOrder: async (_htx, id): Promise<LockedOrder | null> => {
        const o = this.orders.find((x) => x.id === id)
        return o ? { id, kind: o.kind, status: o.status, ordered_on: o.orderedOn, due_on: o.dueOn, total_vnd: o.totalVnd, paid_vnd: o.payments.reduce((s, p) => s + p.amountVnd, BigInt(0)) } : null
      },
      insertPayment: async (p) => { this.orders.find((x) => x.id === p.orderId)!.payments.push(p) },
      cancelOrder: async ({ id, reason }) => { const o = this.orders.find((x) => x.id === id)!; o.status = 'CANCELLED'; o.cancelReason = reason },
      setDueOn: async (id, day) => { this.orders.find((x) => x.id === id)!.dueOn = day },
      view: async (id, today) => this.toView(this.orders.find((x) => x.id === id)!, today),
    }
  }

  inTransaction<T>(_ctx: unknown, work: (unit: SalesUnit) => Promise<T>): Promise<T> {
    const run = this.tail.then(async () => {
      const snapshot = JSON.stringify(this.orders, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v))
      try {
        return await work(this.unit())
      } catch (err) {
        this.orders = JSON.parse(snapshot, (_k, v) => (typeof v === 'string' && /^\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v))
        throw err
      }
    })
    this.tail = run.catch(() => undefined)
    return run
  }

  async sellableLots(): Promise<SellableLot[]> { return [] }
  async list(f: { today: string }) { return { data: this.orders.map((o) => this.toView(o, f.today)), next_cursor: null } }
  async get(_htx: string, id: string, today: string) { const o = this.orders.find((x) => x.id === id); return o ? this.toView(o, today) : null }
  async findByExternalRef(_htx: string, source: string, ref: string, today: string) { const o = this.orders.find((x) => x.source === source && x.externalRef === ref); return o ? this.toView(o, today) : null }
  async receivables(): Promise<ReceivablesSummary> { return { outstanding_vnd: '0', overdue_count: 0, overdue_vnd: '0', partners: [] } }
}
