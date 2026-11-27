// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'
import type { LedgerPort } from '@/domain/ledger/ports/LedgerPort'
import type { LedgerRead } from '@/domain/ledger/views'
import { TICKET_INCLUDE, ticketView } from '@/infrastructure/db/weighing/PrismaFreshLeafTicketRepository'
import { ledgerBalances } from './queries'
import { ADVANCE_INCLUDE, LINE_INCLUDE, advanceView, entryView, householdLineView } from './views'

const ZERO = BigInt(0)
const ENTRY_LIMIT = 200
const SLIP_LIMIT = 200
const LINE_LIMIT = 100

export class PrismaLedgerRepository implements LedgerPort {
  async householdIdsOfUser(htxProfileId: string, keycloakUserId: string) {
    const rows = await prisma.household.findMany({ where: { htx_profile_id: htxProfileId, keycloak_user_id: keycloakUserId }, select: { id: true } })
    return rows.map((r) => r.id)
  }

  async read(htxProfileId: string, householdIds: string[]): Promise<LedgerRead> {
    const households = await prisma.household.findMany({ where: { id: { in: householdIds }, htx_profile_id: htxProfileId }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
    const ids = households.map((h) => h.id)
    const unsettled = { household_id: { in: ids }, status: 'VALID' as const, settlement_id: null }
    const [balances, ticketSums, advanceSums, entries, tickets, advances, lines] = await Promise.all([
      ledgerBalances(prisma, ids),
      prisma.freshLeafTicket.groupBy({ by: ['household_id'], where: unsettled, _sum: { amount_vnd: true } }),
      prisma.inputAdvance.groupBy({ by: ['household_id'], where: unsettled, _sum: { amount_vnd: true } }),
      prisma.memberLedgerEntry.findMany({ where: { household_id: { in: ids } }, orderBy: [{ created_at: 'desc' }, { id: 'desc' }], take: ENTRY_LIMIT }),
      prisma.freshLeafTicket.findMany({ where: unsettled, include: TICKET_INCLUDE, orderBy: [{ weighed_at: 'desc' }, { id: 'desc' }], take: SLIP_LIMIT }),
      prisma.inputAdvance.findMany({ where: unsettled, include: ADVANCE_INCLUDE, orderBy: [{ advanced_on: 'desc' }, { id: 'desc' }], take: SLIP_LIMIT }),
      prisma.memberSettlement.findMany({ where: { household_id: { in: ids } }, include: LINE_INCLUDE, orderBy: [{ period: { date_to: 'desc' } }, { id: 'desc' }], take: LINE_LIMIT }),
    ])
    const ticketTotal = new Map(ticketSums.map((r) => [r.household_id, r._sum.amount_vnd ?? ZERO]))
    const advanceTotal = new Map(advanceSums.map((r) => [r.household_id, r._sum.amount_vnd ?? ZERO]))
    const perHousehold = households.map((h) => ({
      household_id: h.id,
      household_name: h.name,
      balance: (balances.get(h.id) ?? ZERO) + (ticketTotal.get(h.id) ?? ZERO) - (advanceTotal.get(h.id) ?? ZERO),
    }))
    return {
      balance_vnd: perHousehold.reduce((sum, h) => sum + h.balance, ZERO).toString(),
      households: perHousehold.map((h) => ({ household_id: h.household_id, household_name: h.household_name, balance_vnd: h.balance.toString() })),
      entries: entries.map(entryView),
      unsettled_tickets: tickets.map(ticketView),
      unsettled_advances: advances.map(advanceView),
      lines: lines.map(householdLineView),
    }
  }

  async getBank(htxProfileId: string, householdId: string) {
    const h = await prisma.household.findFirst({ where: { id: householdId, htx_profile_id: htxProfileId }, select: { bank_bin: true, bank_account: true, bank_account_name: true } })
    if (!h) return undefined
    return h.bank_bin && h.bank_account ? { bin: h.bank_bin, account: h.bank_account, accountName: h.bank_account_name ?? '' } : null
  }

  async setBank(htxProfileId: string, householdId: string, bank: { bin: string; account: string; accountName: string }, actorId: string) {
    return prisma.$transaction(async (tx) => {
      // The audit row names who changed the payout account; the row itself has no "updated by".
      await tx.$executeRaw`SELECT set_config('dxos.actor', ${`user:${actorId}`}, true)`
      const done = await tx.household.updateMany({
        where: { id: householdId, htx_profile_id: htxProfileId },
        data: { bank_bin: bank.bin, bank_account: bank.account, bank_account_name: bank.accountName },
      })
      return done.count === 1
    })
  }
}
