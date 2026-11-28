// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { TicketView } from '@/domain/weighing/ports/FreshLeafTicketPort'

export type InputKind = 'FERTILIZER' | 'PESTICIDE' | 'OTHER'
export type RecordStatus = 'VALID' | 'VOIDED'
export type LedgerEntryType = 'LEAF_CREDIT' | 'INPUT_DEBIT' | 'PAYOUT' | 'ADJUSTMENT'
export type PaymentMethod = 'TRANSFER' | 'CASH'

export interface InputItemView {
  id: string
  name: string
  unit: string
  unit_price_vnd: number
  kind: InputKind
  pesticide_product_id: string | null
  active: boolean
}

/** An advance as the API shows it. `amount_vnd` is a decimal string because it is a BigInt. */
export interface AdvanceView {
  id: string
  advance_no: string
  household_id: string
  household_name: string
  item_id: string
  item_name: string
  unit: string
  quantity: number
  unit_price_vnd: number
  amount_vnd: string
  advanced_on: string
  status: RecordStatus
  void_reason: string | null
  settlement_id: string | null
}

export interface PeriodView {
  id: string
  code: string
  date_from: string
  date_to: string
  status: 'DRAFT' | 'CLOSED'
  created_by_name: string | null
  closed_by_name: string | null
  closed_at: string | null
}

/** One household of a period. While the period is a draft `id` is null and the paid fields are empty. */
export interface LineView {
  id: string | null
  period_id: string
  household_id: string
  household_name: string
  leaf_net_kg: number
  leaf_amount_vnd: string
  advances_vnd: string
  debt_in_vnd: string
  payable_vnd: string
  debt_out_vnd: string
  paid_at: string | null
  payment_method: PaymentMethod | null
  payment_ref: string | null
  has_bank_account: boolean
}

export interface LedgerEntryView {
  id: string
  household_id: string
  entry_type: LedgerEntryType
  amount_vnd: string
  note: string | null
  ticket_id: string | null
  advance_id: string | null
  settlement_id: string | null
  created_at: string
}

/** A closed line of a household with the period it belongs to, for the household's own ledger page. */
export interface HouseholdLineView extends LineView {
  period_id: string
  period_code: string
  date_from: string
  date_to: string
}

export interface LedgerRead {
  /** Ledger balance plus unsettled leaf money minus unsettled advances: what the cooperative owes the household now. */
  balance_vnd: string
  households: { household_id: string; household_name: string; balance_vnd: string }[]
  entries: LedgerEntryView[]
  unsettled_tickets: TicketView[]
  unsettled_advances: AdvanceView[]
  lines: HouseholdLineView[]
}
