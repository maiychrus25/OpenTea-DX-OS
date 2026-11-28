// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { Prisma } from '@prisma/client'

type Db = Pick<Prisma.TransactionClient, 'memberLedgerEntry' | 'memberSettlement'>

const ZERO = BigInt(0)

/** Ledger balance per household: the sum of all entries. Positive means the cooperative owes the household. */
export async function ledgerBalances(db: Db, householdIds: string[]): Promise<Map<string, bigint>> {
  const rows = await db.memberLedgerEntry.groupBy({ by: ['household_id'], where: { household_id: { in: householdIds } }, _sum: { amount_vnd: true } })
  return new Map(rows.map((r) => [r.household_id, r._sum.amount_vnd ?? ZERO]))
}

/** Payables of closed lines that are not paid yet. They sit in the ledger balance but are paid on their own. */
export async function unpaidPayables(db: Db, householdIds: string[]): Promise<Map<string, bigint>> {
  const rows = await db.memberSettlement.groupBy({ by: ['household_id'], where: { household_id: { in: householdIds }, paid_at: null, payable_vnd: { gt: ZERO } }, _sum: { payable_vnd: true } })
  return new Map(rows.map((r) => [r.household_id, r._sum.payable_vnd ?? ZERO]))
}

/** Spec §7.2: ledger balance minus the unpaid payables of older lines. A negative value is a debt of the household. */
export async function outstandingOf(db: Db, householdIds: string[]): Promise<Map<string, bigint>> {
  const [balances, unpaid] = await Promise.all([ledgerBalances(db, householdIds), unpaidPayables(db, householdIds)])
  return new Map(householdIds.map((id) => [id, (balances.get(id) ?? ZERO) - (unpaid.get(id) ?? ZERO)]))
}
