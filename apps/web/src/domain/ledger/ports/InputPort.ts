// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { AdvanceView, InputItemView, InputKind, RecordStatus } from '../views'

export interface NewInputItem {
  name: string
  unit: string
  unit_price_vnd: number
  kind: InputKind
  pesticide_product_id: string | null
}

export type InputItemPatch = Partial<NewInputItem & { active: boolean }>

export interface NewAdvance {
  htx_profile_id: string
  advance_no: string
  household_id: string
  item_id: string
  quantity: number
  unit_price_vnd: number
  amount_vnd: bigint
  advanced_on: string
  created_by_id: string
  client_id: string | null
}

/** The reads and the write of one advance transaction. */
export interface AdvanceUnit {
  householdOf(htxProfileId: string, id: string): Promise<{ id: string; name: string } | null>
  itemOf(htxProfileId: string, id: string): Promise<InputItemView | null>
  /** Takes the numbering lock of the HTX and day, then returns the next `{CODE}-VT-{YYYYMMDD}-{NNN}`. */
  nextAdvanceNo(htxCode: string, day: string): Promise<string>
  insert(advance: NewAdvance): Promise<AdvanceView>
}

export type AdvanceVoidOutcome =
  | { kind: 'voided'; advance: AdvanceView }
  | { kind: 'not_found' }
  | { kind: 'settled' }
  | { kind: 'already_voided' }

export interface AdvanceFilter {
  htxProfileId: string
  householdId?: string
  /** Vietnam calendar days, `YYYY-MM-DD`, both ends included. */
  from?: string
  to?: string
  status?: RecordStatus
  cursor?: string
}

export interface InputPort {
  listItems(htxProfileId: string): Promise<InputItemView[]>
  itemByName(htxProfileId: string, name: string): Promise<InputItemView | null>
  itemById(htxProfileId: string, id: string): Promise<InputItemView | null>
  createItem(htxProfileId: string, data: NewInputItem): Promise<InputItemView>
  updateItem(htxProfileId: string, id: string, patch: InputItemPatch): Promise<InputItemView | null>
  pesticideExists(productId: string): Promise<boolean>

  inAdvanceTransaction<T>(work: (unit: AdvanceUnit) => Promise<T>): Promise<T>
  findAdvanceByClientId(createdById: string, clientId: string): Promise<AdvanceView | null>
  voidAdvance(input: { htxProfileId: string; id: string; reason: string; userId: string; at: Date }): Promise<AdvanceVoidOutcome>
  listAdvances(filter: AdvanceFilter): Promise<{ data: AdvanceView[]; next_cursor: string | null; totals: { amount_vnd: string } }>
  listAdvancesRange(htxProfileId: string, from: string, to: string, max: number): Promise<AdvanceView[]>
}
