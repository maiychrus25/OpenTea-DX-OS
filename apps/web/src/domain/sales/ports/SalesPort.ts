// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { ReceivablesSummary, SalesKind, SalesOrderView, SalesPaymentMethod, SalesSource, SalesStatus, SellableLot } from '../views'

/** A lot of the cooperative as the stock check sees it. `capacity_g` is null when the lot has no weight. */
export interface LotStock {
  lot_id: string
  lot_code: string
  qr_exported: boolean
  capacity_g: number | null
  /** Grams in lines of CONFIRMED orders. */
  sold_g: number
}

export interface NewOrderLine {
  lot_id: string
  net_g: number
  pack_count: number | null
  pack_net_g: number | null
  price_vnd_per_kg: number | null
  amount_vnd: bigint
}

export interface NewOrder {
  htxProfileId: string
  orderNo: string
  kind: SalesKind
  source: SalesSource
  externalRef: string | null
  partnerId: string | null
  customerName: string | null
  orderedOn: string
  dueOn: string | null
  totalVnd: bigint
  note: string | null
  createdById: string
  lines: NewOrderLine[]
}

/** An order row locked for a change. Days are Vietnam days `YYYY-MM-DD`. */
export interface LockedOrder {
  id: string
  kind: SalesKind
  status: SalesStatus
  ordered_on: string
  due_on: string | null
  total_vnd: bigint
  paid_vnd: bigint
}

export interface NewPayment {
  orderId: string
  amountVnd: bigint
  paidOn: string
  method: SalesPaymentMethod
  ref: string | null
  createdById: string
}

/** The reads and writes of one sales transaction. `dxos.actor` is set; lots and orders are locked by the calls that say so. */
export interface SalesUnit {
  partnerExists(htxProfileId: string, id: string): Promise<boolean>
  /** The cooperative's lots among `ids`, rows locked in id order. A foreign or missing lot is absent. */
  lockLots(htxProfileId: string, ids: string[]): Promise<LotStock[]>
  /** `{HTX}-DH-YYYYMMDD-NNN` under the advisory lock of that cooperative and day. */
  nextOrderNo(htxCode: string, day: string): Promise<string>
  /** Takes the lock that serialises the same `external_ref`, so a replay waits for the first call. */
  lockExternalRef(htxCode: string, ref: string): Promise<void>
  findByExternalRef(htxProfileId: string, source: SalesSource, ref: string): Promise<string | null>
  insertOrder(order: NewOrder): Promise<string>
  /** The order with its row locked, so a payment or a cancel waits and then sees the latest state. */
  lockOrder(htxProfileId: string, id: string): Promise<LockedOrder | null>
  insertPayment(payment: NewPayment): Promise<void>
  cancelOrder(input: { id: string; by: string; at: Date; reason: string }): Promise<void>
  setDueOn(id: string, day: string): Promise<void>
  view(id: string, today: string): Promise<SalesOrderView>
}

export interface SalesListFilter {
  htxProfileId: string
  today: string
  kind?: SalesKind
  status?: SalesStatus
  overdue?: boolean
  partnerId?: string
  cursor?: string
}

export interface SalesPort {
  inTransaction<T>(ctx: { htxProfileId: string; htxCode: string; actorId: string }, work: (unit: SalesUnit) => Promise<T>): Promise<T>
  sellableLots(htxProfileId: string): Promise<SellableLot[]>
  list(filter: SalesListFilter): Promise<{ data: SalesOrderView[]; next_cursor: string | null }>
  get(htxProfileId: string, id: string, today: string): Promise<SalesOrderView | null>
  findByExternalRef(htxProfileId: string, source: SalesSource, ref: string, today: string): Promise<SalesOrderView | null>
  receivables(htxProfileId: string, today: string): Promise<ReceivablesSummary>
}
