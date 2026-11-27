// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { Prisma } from '@prisma/client'
import type { AdvanceView, HouseholdLineView, LedgerEntryView, LineView, PeriodView } from '@/domain/ledger/views'

export const ADVANCE_INCLUDE = {
  household: { select: { name: true } },
  item: { select: { name: true, unit: true } },
} satisfies Prisma.InputAdvanceInclude

export type AdvanceRow = Prisma.InputAdvanceGetPayload<{ include: typeof ADVANCE_INCLUDE }>

export const dayString = (date: Date) => date.toISOString().slice(0, 10)
export const dateOf = (day: string) => new Date(`${day}T00:00:00Z`)

export function advanceView(row: AdvanceRow): AdvanceView {
  return {
    id: row.id,
    advance_no: row.advance_no,
    household_id: row.household_id,
    household_name: row.household.name,
    item_id: row.item_id,
    item_name: row.item.name,
    unit: row.item.unit,
    quantity: Number(row.quantity),
    unit_price_vnd: row.unit_price_vnd,
    amount_vnd: row.amount_vnd.toString(),
    advanced_on: dayString(row.advanced_on),
    status: row.status,
    void_reason: row.void_reason,
    settlement_id: row.settlement_id,
  }
}

export const LINE_INCLUDE = {
  household: { select: { name: true, bank_bin: true, bank_account: true } },
  period: { select: { code: true, date_from: true, date_to: true } },
} satisfies Prisma.MemberSettlementInclude

export type LineRow = Prisma.MemberSettlementGetPayload<{ include: typeof LINE_INCLUDE }>

export function lineView(row: LineRow): LineView {
  return {
    id: row.id,
    period_id: row.period_id,
    household_id: row.household_id,
    household_name: row.household.name,
    leaf_net_kg: Number(row.leaf_net_kg),
    leaf_amount_vnd: row.leaf_amount_vnd.toString(),
    advances_vnd: row.advances_vnd.toString(),
    debt_in_vnd: row.debt_in_vnd.toString(),
    payable_vnd: row.payable_vnd.toString(),
    debt_out_vnd: row.debt_out_vnd.toString(),
    paid_at: row.paid_at?.toISOString() ?? null,
    payment_method: row.payment_method,
    payment_ref: row.payment_ref,
    has_bank_account: Boolean(row.household.bank_bin && row.household.bank_account),
  }
}

export function householdLineView(row: LineRow): HouseholdLineView {
  return { ...lineView(row), period_code: row.period.code, date_from: dayString(row.period.date_from), date_to: dayString(row.period.date_to) }
}

export function entryView(row: Prisma.MemberLedgerEntryGetPayload<object>): LedgerEntryView {
  return {
    id: row.id,
    household_id: row.household_id,
    entry_type: row.entry_type,
    amount_vnd: row.amount_vnd.toString(),
    note: row.note,
    ticket_id: row.ticket_id,
    advance_id: row.advance_id,
    settlement_id: row.settlement_id,
    created_at: row.created_at.toISOString(),
  }
}

export function periodView(row: Prisma.SettlementPeriodGetPayload<object>): PeriodView {
  return {
    id: row.id,
    code: row.code,
    date_from: dayString(row.date_from),
    date_to: dayString(row.date_to),
    status: row.status,
    created_by_name: row.created_by_name,
    closed_by_name: row.closed_by_name,
    closed_at: row.closed_at?.toISOString() ?? null,
  }
}
