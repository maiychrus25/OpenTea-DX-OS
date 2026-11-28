// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { TicketView } from '@/domain/weighing/ports/FreshLeafTicketPort'
import type { AdvanceView, LedgerEntryType, LedgerEntryView, LineView, PaymentMethod, PeriodView } from '../views'

export interface PeriodRecord {
  id: string
  code: string
  /** Vietnam calendar days, `YYYY-MM-DD`. */
  date_from: string
  date_to: string
  status: 'DRAFT' | 'CLOSED'
}

/** What one household has in the period, before it is settled. */
export interface HouseholdSlips {
  household_id: string
  household_name: string
  has_bank_account: boolean
  /** Net kg of the valid tickets, one decimal, as a string: `12.3`. */
  leaf_net_kg: string
  leaf_vnd: bigint
  advances_vnd: bigint
  /** Ledger balance minus the unpaid payables of older lines; negative is a debt of the household. */
  outstanding_vnd: bigint
  ticket_ids: string[]
  advance_ids: string[]
}

export interface NewLine {
  period_id: string
  household_id: string
  leaf_net_kg: string
  leaf_amount_vnd: bigint
  advances_vnd: bigint
  debt_in_vnd: bigint
  payable_vnd: bigint
  debt_out_vnd: bigint
  ticket_ids: string[]
  advance_ids: string[]
}

export interface NewLedgerEntry {
  household_id: string
  entry_type: LedgerEntryType
  amount_vnd: bigint
  settlement_id: string | null
  note?: string
}

/** The reads and writes of one settlement transaction. The HTX settlement lock is held and `dxos.actor` is set. */
export interface SettlementUnit {
  lastPeriod(htxProfileId: string): Promise<PeriodRecord | null>
  hasDraft(htxProfileId: string): Promise<boolean>
  /** Vietnam day of the earliest valid slip that is in no settlement, or null. */
  earliestUnsettledDay(htxProfileId: string): Promise<string | null>
  insertPeriod(input: { htxProfileId: string; code: string; dateFrom: string; dateTo: string; createdById: string; createdByName: string | null }): Promise<PeriodView>
  /** The period of the HTX with its row locked, so a second close waits and then sees `CLOSED`. */
  lockPeriod(htxProfileId: string, id: string): Promise<PeriodRecord | null>
  /** Valid, unsettled tickets and advances up to the end of `dateTo`, grouped by household. Rows are locked. */
  collect(htxProfileId: string, dateTo: string): Promise<HouseholdSlips[]>
  /** Writes the line and puts its slips into it; returns the line id. */
  createLine(line: NewLine): Promise<string>
  addEntries(htxProfileId: string, createdById: string, entries: NewLedgerEntry[]): Promise<void>
  closePeriod(id: string, by: { id: string; name: string | null }, at: Date): Promise<void>
}

export interface SlipSource {
  htx: { name: string; code: string }
  household: { id: string; name: string; keycloak_user_id: string | null; bank_bin: string | null; bank_account: string | null; bank_account_name: string | null }
  period: PeriodView
  line: LineView
  tickets: TicketView[]
  advances: AdvanceView[]
}

export type PayoutOutcome =
  | { kind: 'paid'; line: LineView }
  | { kind: 'not_found' }
  | { kind: 'nothing_to_pay' }
  | { kind: 'already_paid' }

export interface SettlementPort {
  inTransaction<T>(ctx: { htxProfileId: string; htxCode: string; actorId: string }, work: (unit: SettlementUnit) => Promise<T>): Promise<T>
  listPeriods(htxProfileId: string): Promise<PeriodView[]>
  getPeriod(htxProfileId: string, id: string): Promise<(PeriodView & { record: PeriodRecord }) | null>
  closedLines(htxProfileId: string, periodId: string): Promise<LineView[]>
  /** The draft numbers, without locks. */
  preview(htxProfileId: string, dateTo: string): Promise<HouseholdSlips[]>
  /**
   * One conditional write on `paid_at IS NULL` plus the PAYOUT entry, in one transaction under the settlement lock.
   * A second caller gets `already_paid` and nothing is written.
   */
  payLine(input: {
    htxProfileId: string
    htxCode: string
    periodId: string
    lineId: string
    method: PaymentMethod
    ref: string | null
    userId: string
    at: Date
  }): Promise<PayoutOutcome>
  slipSource(htxProfileId: string, periodId: string, lineId: string): Promise<SlipSource | null>
  /** null when the household is not in the HTX. Runs under the settlement lock so it never splits a close. */
  addAdjustment(input: { htxProfileId: string; htxCode: string; householdId: string; amountVnd: bigint; reason: string; userId: string }): Promise<LedgerEntryView | null>
}
