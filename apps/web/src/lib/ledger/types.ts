// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { LeafTicket } from '@/lib/weighing/types'

/** Input item from GET /api/input-items (contract in the S4 plan). */
export interface InputItem {
  id: string
  name: string
  unit: string
  unit_price_vnd: number
  kind: 'FERTILIZER' | 'PESTICIDE' | 'OTHER'
  pesticide_product_id: string | null
  active: boolean
}

/** Input advance (cấp ứng vật tư). Money fields are decimal strings. */
export interface InputAdvance {
  id: string
  advance_no: string
  household_id: string
  household_name: string
  item_id: string
  item_name: string
  unit: string
  quantity: number | string
  unit_price_vnd: number
  amount_vnd: string
  advanced_on: string
  status: 'VALID' | 'VOIDED'
  void_reason: string | null
  settlement_id: string | null
}

export interface AdvancePage {
  data: InputAdvance[]
  next_cursor: string | null
  totals: { amount_vnd: string }
}

export interface BankOption {
  bin: string
  name: string
}

/** Bank details as the server returns them. `bank_account` is the full number (manager and accountant only). */
export interface HouseholdBank {
  bank_bin: string | null
  bank_name: string | null
  bank_account?: string | null
  account_masked: string | null
  bank_account_name: string | null
}

/** Settlement period (kỳ quyết toán). */
export interface SettlementPeriod {
  id: string
  code: string
  date_from: string
  date_to: string
  status: 'DRAFT' | 'CLOSED'
  created_by_name: string | null
  closed_by_name: string | null
  closed_at: string | null
}

/** Totals of a period; every amount is a decimal string. */
export interface SettlementTotals {
  households: number
  leaf_amount_vnd: string
  advances_vnd: string
  payable_vnd: string
  debt_out_vnd: string
}

/** One household's line. `id` is null while the period is a draft. */
export interface SettlementLine {
  id: string | null
  /** The period the line belongs to; the slip URL is built from it. */
  period_id: string
  household_id: string
  household_name: string
  leaf_net_kg: number | string
  leaf_amount_vnd: string
  advances_vnd: string
  debt_in_vnd: string
  payable_vnd: string
  debt_out_vnd: string
  paid_at: string | null
  payment_method: 'TRANSFER' | 'CASH' | null
  payment_ref: string | null
  has_bank_account: boolean
}

export interface SettlementDetail {
  period: SettlementPeriod
  lines: SettlementLine[]
  totals: SettlementTotals
}

/** The printable slip of one line; `qr` is null when the household has no bank account. */
export interface SettlementSlip {
  htx: { name: string }
  household: { name: string }
  period: SettlementPeriod
  tickets: LeafTicket[]
  advances: InputAdvance[]
  line: SettlementLine
  qr: { data_url: string; bank_name: string; account_masked: string; account_full?: string } | null
  transfer_note: string
}

/** One row of the member ledger (sổ cái). Amounts are decimal strings; positive means the HTX owes the household. */
export interface LedgerEntry {
  id: string
  entry_type: 'LEAF_CREDIT' | 'INPUT_DEBIT' | 'PAYOUT' | 'ADJUSTMENT'
  amount_vnd: string
  created_at: string
  note: string | null
}

/** A settlement line as the farmer's ledger lists it, with its period's code and dates. */
export interface LedgerLine extends SettlementLine {
  period_code: string
  date_from: string
  date_to: string
}

/** One household's balance; a farmer with several households gets one entry each. */
export interface LedgerHouseholdBalance {
  household_id: string
  household_name: string
  balance_vnd: string
}

/** GET /api/ledger/mine: the farmer's balance and what is not settled yet, across every household of the account. */
export interface LedgerMine {
  balance_vnd: string
  households: LedgerHouseholdBalance[]
  entries: LedgerEntry[]
  unsettled_tickets: LeafTicket[]
  unsettled_advances: InputAdvance[]
  lines: LedgerLine[]
}
