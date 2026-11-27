// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { SprayEntry } from '@/domain/journal/blocking-sprays'

export type TicketStatus = 'VALID' | 'VOIDED'

/** A ticket as the API shows it. `amount_vnd` is a decimal string because it is a BigInt. */
export interface TicketView {
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
  gross_kg: number
  deduction_pct: number
  net_kg: number
  price_vnd_per_kg: number
  amount_vnd: string
  status: TicketStatus
  void_reason: string | null
  settlement_id: string | null
}

export interface NewTicket {
  htx_profile_id: string
  ticket_no: string
  household_id: string
  parcel_id: string
  cycle_id: string | null
  grade_id: string
  weighed_at: Date
  gross_kg: number
  deduction_pct: number
  net_kg: number
  price_vnd_per_kg: number
  amount_vnd: bigint
  created_by_id: string
  client_id: string | null
}

export interface LockedParcel {
  id: string
  parcel_code: string
  status: string
  household_id: string
  htx_profile_id: string | null
}

/** The reads and the write of one ticket transaction. The parcel row stays locked until it ends. */
export interface TicketUnit {
  /** Locks the parcel row (`FOR UPDATE`), so a spray journal and a ticket of the same parcel never pass each other. */
  lockParcel(parcelId: string): Promise<LockedParcel | null>
  sprayEntries(parcelId: string, asOf: Date): Promise<SprayEntry[]>
  gradeOf(htxProfileId: string, gradeId: string): Promise<{ id: string; name: string; active: boolean } | null>
  priceOf(gradeId: string, day: string): Promise<number | null>
  /** The open flush of the parcel, else the latest closed one, else null (legacy parcels). */
  cycleIdFor(parcelId: string): Promise<string | null>
  /** Takes the numbering lock of the HTX and day, then returns the next `{CODE}-PC-{YYYYMMDD}-{NNN}`. */
  nextTicketNo(htxCode: string, day: string): Promise<string>
  insert(ticket: NewTicket): Promise<TicketView>
}

export type VoidOutcome =
  | { kind: 'voided'; ticket: TicketView }
  | { kind: 'not_found' }
  | { kind: 'settled' }
  | { kind: 'already_voided' }

export interface TicketFilter {
  htxProfileId: string
  /** Vietnam calendar day, `YYYY-MM-DD`. */
  day?: string
  householdId?: string
  status?: TicketStatus
  cursor?: string
}

export interface FreshLeafTicketPort {
  inTicketTransaction<T>(work: (unit: TicketUnit) => Promise<T>): Promise<T>
  findByClientId(createdById: string, clientId: string): Promise<TicketView | null>
  voidTicket(input: { htxProfileId: string; id: string; reason: string; userId: string; at: Date }): Promise<VoidOutcome>
  /** Parcel of the HTX, for the withdrawal light; null when it does not belong to it. */
  parcelOf(htxProfileId: string, parcelId: string): Promise<{ id: string; parcel_code: string } | null>
  sprayEntries(parcelId: string, asOf: Date): Promise<SprayEntry[]>
  get(htxProfileId: string, id: string): Promise<(TicketView & { household_keycloak_user_id: string | null }) | null>
  list(filter: TicketFilter): Promise<{ data: TicketView[]; next_cursor: string | null; totals: { net_kg: number; amount_vnd: string } }>
  mine(htxProfileId: string, keycloakUserId: string): Promise<TicketView[]>
  /** Tickets weighed from the start of `fromDay` to the end of `toDay` (Vietnam days). */
  listRange(htxProfileId: string, fromDay: string, toDay: string, max: number): Promise<TicketView[]>
  /** Households of the HTX by name or phone, with the parcels that can be weighed (not drafts). Limit 20. */
  searchHouseholds(htxProfileId: string, q: string): Promise<{ id: string; name: string; phone: string; parcels: { id: string; parcel_code: string }[] }[]>
  weighingSummary(htxProfileId: string, cycleId: string): Promise<{ ticket_net_kg: number; journal_fresh_leaf_kg: number }>
}
