// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

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

/** Bank details as PUT /api/households/[id]/bank returns them; the account is masked. */
export interface HouseholdBank {
  bank_bin: string | null
  bank_name: string | null
  account_masked: string | null
  bank_account_name: string | null
}
