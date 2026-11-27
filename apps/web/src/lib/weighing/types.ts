// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** A fresh-leaf ticket as the weighing API returns it (contract in the S3 plan). */
export interface LeafTicket {
  id: string
  ticket_no: string
  household_id: string
  household_name: string
  parcel_id: string
  parcel_code: string
  cycle_id: string | null
  grade_id: string
  grade_name: string
  weighed_at: string
  gross_kg: number | string
  deduction_pct: number | string
  net_kg: number | string
  price_vnd_per_kg: number
  /** A decimal string: money is BigInt on the server. */
  amount_vnd: string
  status: 'VALID' | 'VOIDED'
  void_reason: string | null
  settlement_id: string | null
}

export interface LeafTicketPage {
  data: LeafTicket[]
  next_cursor: string | null
  totals: { net_kg: number | string; amount_vnd: string }
}

/** Withdrawal light of one parcel from GET /api/parcels/[id]/withdrawal-status. */
export interface WithdrawalStatus {
  blocked: boolean
  safe_from: string | null
}
