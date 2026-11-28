// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { DryTeaGrade } from '@/domain/processing/grades'

/** Phase 3 S8 contract. Money is a BigInt decimal string; weights are whole grams; days are Vietnam days YYYY-MM-DD. */
export type SalesKind = 'WHOLESALE' | 'RETAIL'
export type SalesStatus = 'CONFIRMED' | 'CANCELLED'
export type SalesSource = 'CORE' | 'TEA_SHOP'
export type SalesPaymentMethod = 'TRANSFER' | 'CASH'

/** A QR-exported lot of the cooperative with what is left to sell. */
export interface SellableLot {
  lot_id: string
  lot_code: string
  dry_grade: DryTeaGrade | null
  quality_grade: string | null
  capacity_g: number
  remaining_g: number
}

export interface SalesOrderLineView {
  id: string
  lot_id: string
  lot_code: string
  net_g: number
  pack_count: number | null
  pack_net_g: number | null
  price_vnd_per_kg: number | null
  amount_vnd: string
}

export interface SalesPaymentView {
  id: string
  amount_vnd: string
  paid_on: string
  method: SalesPaymentMethod
  ref: string | null
  created_at: string
}

export interface SalesOrderView {
  id: string
  order_no: string
  kind: SalesKind
  source: SalesSource
  external_ref: string | null
  partner_id: string | null
  partner_name: string | null
  customer_name: string | null
  ordered_on: string
  /** Wholesale only; null for retail. */
  due_on: string | null
  status: SalesStatus
  total_vnd: string
  paid_vnd: string
  outstanding_vnd: string
  /** Wholesale, confirmed, outstanding > 0 and due_on before today. */
  overdue: boolean
  note: string | null
  created_at: string
  cancelled_at: string | null
  cancel_reason: string | null
  lines: SalesOrderLineView[]
  payments: SalesPaymentView[]
}

/** Trader receivables: wholesale confirmed orders only. */
export interface ReceivablesSummary {
  outstanding_vnd: string
  overdue_count: number
  overdue_vnd: string
  partners: { partner_id: string; partner_name: string; outstanding_vnd: string; overdue_vnd: string }[]
}
