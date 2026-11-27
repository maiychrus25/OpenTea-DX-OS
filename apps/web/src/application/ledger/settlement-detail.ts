// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { settleHousehold } from '@/domain/ledger/settlement'
import type { HouseholdSlips } from '@/domain/ledger/ports/SettlementPort'
import type { LineView } from '@/domain/ledger/views'

export interface PeriodTotals {
  households: number
  leaf_amount_vnd: string
  advances_vnd: string
  payable_vnd: string
  debt_out_vnd: string
}

const ZERO = BigInt(0)

export function settleSlips(slips: HouseholdSlips) {
  return settleHousehold({ leafVnd: slips.leaf_vnd, advancesVnd: slips.advances_vnd, outstandingVnd: slips.outstanding_vnd })
}

/** The numbers of a draft period, as lines without an id. */
export function draftLines(periodId: string, rows: HouseholdSlips[]): LineView[] {
  return rows
    .map((row) => {
      const result = settleSlips(row)
      return {
        id: null,
        period_id: periodId,
        household_id: row.household_id,
        household_name: row.household_name,
        leaf_net_kg: Number(row.leaf_net_kg),
        leaf_amount_vnd: row.leaf_vnd.toString(),
        advances_vnd: row.advances_vnd.toString(),
        debt_in_vnd: result.debtInVnd.toString(),
        payable_vnd: result.payableVnd.toString(),
        debt_out_vnd: result.debtOutVnd.toString(),
        paid_at: null,
        payment_method: null,
        payment_ref: null,
        has_bank_account: row.has_bank_account,
      }
    })
    .sort((a, b) => a.household_name.localeCompare(b.household_name, 'vi'))
}

export function totalsOf(lines: LineView[]): PeriodTotals {
  const sum = (pick: (l: LineView) => string) => lines.reduce((acc, l) => acc + BigInt(pick(l)), ZERO).toString()
  return {
    households: lines.length,
    leaf_amount_vnd: sum((l) => l.leaf_amount_vnd),
    advances_vnd: sum((l) => l.advances_vnd),
    payable_vnd: sum((l) => l.payable_vnd),
    debt_out_vnd: sum((l) => l.debt_out_vnd),
  }
}
