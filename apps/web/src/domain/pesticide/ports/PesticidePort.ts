// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export type PesticideGroupName = 'BOTANICAL' | 'MICROBIAL' | 'BIOLOGICAL' | 'CHEMICAL' | 'ANTIBIOTIC'

export interface PesticideRow {
  id: string
  trade_name: string
  active_ingredient: string
  group: PesticideGroupName
  targets: string[]
  default_phi_days: number
  floor_days: number
  label: { label_phi_days: number; label_note: string | null; verified_at: string } | null
  needs_label_check: boolean
}

export interface PesticideListOptions {
  q?: string
  target?: string
  /** Sorts the products this household used in the last 365 days first. */
  householdId?: string
}

export interface PesticidePort {
  /** The effective floor of an active product for one cooperative; null when the product is unknown or inactive. */
  floorFor(productId: string, htxProfileId: string): Promise<{ productId: string; floorDays: number } | null>
  /** Matches a trade name ignoring case and extra spaces; null when no active product has that name. */
  matchByTradeName(name: string): Promise<string | null>
  list(htxProfileId: string, opts: PesticideListOptions): Promise<PesticideRow[]>
  /** null when the product does not exist. */
  setLabel(
    htxProfileId: string,
    productId: string,
    input: { label_phi_days: number; label_note: string | null; verified_by_id: string }
  ): Promise<PesticideRow | null>
  clearLabel(htxProfileId: string, productId: string): Promise<PesticideRow | null>
}
