// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { DryTeaGrade } from '@/domain/processing/grades'

/** The cooperative head's morning board (phase 3 spec §3 S7). A block that failed to load is null. */
export interface DirectorBoard {
  /** Vietnam day, YYYY-MM-DD. */
  today: string
  leaf: LeafToday | null
  prices: PricesToday | null
  payable: MemberPayable | null
  dry_stock: DryStockByGrade[] | null
  /** Sales come in sub-project S8; until then the block says there are no wholesale orders. */
  receivables: { available: false }
  alerts: BoardAlert[] | null
}

export interface LeafToday {
  net_kg: number
  /** BigInt as a decimal string. */
  amount_vnd: string
  tickets: number
  yesterday_net_kg: number
}

export interface PricesToday {
  published: boolean
  grades: { grade_id: string; grade_name: string; price_vnd_per_kg: number }[]
}

/** Money strings are BigInt decimals. total = unpaid closed lines + unsettled leaf − unsettled advances. */
export interface MemberPayable {
  unpaid_lines_vnd: string
  unsettled_leaf_vnd: string
  unsettled_advances_vnd: string
  total_vnd: string
}

/** All five grades, in `DRY_TEA_GRADES` order, zero included. */
export interface DryStockByGrade {
  grade: DryTeaGrade
  kg: number
}

export type BoardAlertKind =
  | 'PARCELS_IN_WITHDRAWAL'
  | 'BATCH_OUT_OF_BAND'
  | 'BATCH_OPEN_TOO_LONG'
  | 'OLD_DRY_STOCK'
  | 'SETTLEMENT_DRAFT'
  | 'UNPAID_LINES'
  | 'PRICE_NOT_PUBLISHED'

/** Alerts the accountant also sees; the others are for the head only. */
export const MONEY_ALERTS: readonly BoardAlertKind[] = ['SETTLEMENT_DRAFT', 'UNPAID_LINES', 'PRICE_NOT_PUBLISHED']

export interface BoardAlert {
  kind: BoardAlertKind
  count: number
  /** Vietnamese, ready to show. */
  message: string
  href: string
}
