// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { randomUUID } from 'crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/infrastructure/db/prisma.client'
import { ConflictError } from '@/domain/errors'
import type { HouseholdSlips, PayoutOutcome, SettlementPort, SettlementUnit, SlipSource } from '@/domain/ledger/ports/SettlementPort'
import type { PaymentMethod } from '@/domain/ledger/views'
import { vnDayOf, vnDayStart } from '@/application/agent/campaign/vn-day'
import { TICKET_INCLUDE, ticketView } from '@/infrastructure/db/weighing/PrismaFreshLeafTicketRepository'
import { outstandingOf } from './queries'
import { ADVANCE_INCLUDE, LINE_INCLUDE, advanceView, dateOf, dayString, entryView, lineView, periodView } from './views'

const DAY_MS = 24 * 60 * 60 * 1000
const ZERO = BigInt(0)
// Closing a cooperative of a few hundred households writes a few thousand rows; the default 5 s is too short.
const TX_OPTIONS = { timeout: 120_000, maxWait: 10_000 }

type Tx = Prisma.TransactionClient

/** One writer per cooperative changes money at a time: closing, paying and adjusting take the same lock. */
async function lockSettlement(tx: Tx, htxCode: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`settlement:${htxCode}`}))`
}

async function setActor(tx: Tx, userId: string) {
  // Row audit events of these writes name the person.
  await tx.$executeRaw`SELECT set_config('dxos.actor', ${`user:${userId}`}, true)`
}

/** Valid, unsettled slips up to the end of `dateTo`, grouped by household. With `lock`, the rows are locked until the end. */
async function collectSlips(tx: Tx, htxProfileId: string, dateTo: string, lock: boolean): Promise<HouseholdSlips[]> {
  // A naive UTC timestamp string, cast on the database side: no time zone guess in the driver.
  const end = new Date(vnDayStart(dateTo).getTime() + DAY_MS).toISOString().slice(0, 23)
  const tickets = lock
    ? await tx.$queryRaw<{ id: string; household_id: string; net_kg: string; amount_vnd: bigint }[]>`
        SELECT id, household_id, net_kg::text AS net_kg, amount_vnd FROM fresh_leaf_tickets
        WHERE htx_profile_id = ${htxProfileId} AND status = 'VALID' AND settlement_id IS NULL AND weighed_at < ${end}::timestamp
        ORDER BY id FOR UPDATE`
    : await tx.$queryRaw<{ id: string; household_id: string; net_kg: string; amount_vnd: bigint }[]>`
        SELECT id, household_id, net_kg::text AS net_kg, amount_vnd FROM fresh_leaf_tickets
        WHERE htx_profile_id = ${htxProfileId} AND status = 'VALID' AND settlement_id IS NULL AND weighed_at < ${end}::timestamp`
  const advances = lock
    ? await tx.$queryRaw<{ id: string; household_id: string; amount_vnd: bigint }[]>`
        SELECT id, household_id, amount_vnd FROM input_advances
        WHERE htx_profile_id = ${htxProfileId} AND status = 'VALID' AND settlement_id IS NULL AND advanced_on <= ${dateTo}::date
        ORDER BY id FOR UPDATE`
    : await tx.$queryRaw<{ id: string; household_id: string; amount_vnd: bigint }[]>`
        SELECT id, household_id, amount_vnd FROM input_advances
        WHERE htx_profile_id = ${htxProfileId} AND status = 'VALID' AND settlement_id IS NULL AND advanced_on <= ${dateTo}::date`

  const ids = Array.from(new Set([...tickets.map((t) => t.household_id), ...advances.map((a) => a.household_id)]))
  if (ids.length === 0) return []
  const [households, outstanding] = await Promise.all([
    tx.household.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, bank_bin: true, bank_account: true } }),
    outstandingOf(tx, ids),
  ])
  return households.map((h) => {
    const mine = tickets.filter((t) => t.household_id === h.id)
    const theirs = advances.filter((a) => a.household_id === h.id)
    const tenths = mine.reduce((sum, t) => sum + Math.round(Number(t.net_kg) * 10), 0)
    return {
      household_id: h.id,
      household_name: h.name,
      has_bank_account: Boolean(h.bank_bin && h.bank_account),
      leaf_net_kg: (tenths / 10).toFixed(1),
      leaf_vnd: mine.reduce((sum, t) => sum + t.amount_vnd, ZERO),
      advances_vnd: theirs.reduce((sum, a) => sum + a.amount_vnd, ZERO),
      outstanding_vnd: outstanding.get(h.id) ?? ZERO,
      ticket_ids: mine.map((t) => t.id),
      advance_ids: theirs.map((a) => a.id),
    }
  })
}

function unitOf(tx: Tx): SettlementUnit {
  return {
    async lastPeriod(htxProfileId) {
      const row = await tx.settlementPeriod.findFirst({ where: { htx_profile_id: htxProfileId }, orderBy: { date_to: 'desc' } })
      return row ? { id: row.id, code: row.code, date_from: dayString(row.date_from), date_to: dayString(row.date_to), status: row.status } : null
    },
    async hasDraft(htxProfileId) {
      return (await tx.settlementPeriod.count({ where: { htx_profile_id: htxProfileId, status: 'DRAFT' } })) > 0
    },
    async earliestUnsettledDay(htxProfileId) {
      const where = { htx_profile_id: htxProfileId, status: 'VALID' as const, settlement_id: null }
      const [ticket, advance] = await Promise.all([
        tx.freshLeafTicket.findFirst({ where, orderBy: { weighed_at: 'asc' }, select: { weighed_at: true } }),
        tx.inputAdvance.findFirst({ where, orderBy: { advanced_on: 'asc' }, select: { advanced_on: true } }),
      ])
      const days = [ticket ? vnDayOf(ticket.weighed_at) : null, advance ? dayString(advance.advanced_on) : null].filter((d): d is string => d !== null)
      return days.sort()[0] ?? null
    },
    async insertPeriod(input) {
      const row = await tx.settlementPeriod.create({
        data: { htx_profile_id: input.htxProfileId, code: input.code, date_from: dateOf(input.dateFrom), date_to: dateOf(input.dateTo), created_by_id: input.createdById, created_by_name: input.createdByName },
      })
      return periodView(row)
    },
    async lockPeriod(htxProfileId, id) {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM settlement_periods WHERE id = ${id} AND htx_profile_id = ${htxProfileId} FOR UPDATE`
      if (rows.length === 0) return null
      const row = await tx.settlementPeriod.findUniqueOrThrow({ where: { id } })
      return { id: row.id, code: row.code, date_from: dayString(row.date_from), date_to: dayString(row.date_to), status: row.status }
    },
    collect: (htxProfileId, dateTo) => collectSlips(tx, htxProfileId, dateTo, true),
    async createLine(line) {
      const id = randomUUID()
      await tx.memberSettlement.create({
        data: {
          id, period_id: line.period_id, household_id: line.household_id, leaf_net_kg: line.leaf_net_kg, leaf_amount_vnd: line.leaf_amount_vnd,
          advances_vnd: line.advances_vnd, debt_in_vnd: line.debt_in_vnd, payable_vnd: line.payable_vnd, debt_out_vnd: line.debt_out_vnd,
        },
      })
      // The rows are locked by collect(); a different count means something changed them, so the whole close stops.
      const [tickets, advances] = await Promise.all([
        tx.freshLeafTicket.updateMany({ where: { id: { in: line.ticket_ids }, status: 'VALID', settlement_id: null }, data: { settlement_id: id } }),
        tx.inputAdvance.updateMany({ where: { id: { in: line.advance_ids }, status: 'VALID', settlement_id: null }, data: { settlement_id: id } }),
      ])
      if (tickets.count !== line.ticket_ids.length || advances.count !== line.advance_ids.length) {
        throw new ConflictError('PERIOD_CHANGED', 'Phiếu của kỳ vừa thay đổi. Mở lại kỳ rồi chốt lại.')
      }
      return id
    },
    async addEntries(htxProfileId, createdById, entries) {
      if (entries.length === 0) return
      await tx.memberLedgerEntry.createMany({
        data: entries.map((e) => ({ htx_profile_id: htxProfileId, household_id: e.household_id, entry_type: e.entry_type, amount_vnd: e.amount_vnd, settlement_id: e.settlement_id, note: e.note ?? null, created_by_id: createdById })),
      })
    },
    async closePeriod(id, by, at) {
      await tx.settlementPeriod.update({ where: { id }, data: { status: 'CLOSED', closed_by_id: by.id, closed_by_name: by.name, closed_at: at } })
    },
  }
}

export class PrismaSettlementRepository implements SettlementPort {
  inTransaction<T>(ctx: { htxProfileId: string; htxCode: string; actorId: string }, work: (unit: SettlementUnit) => Promise<T>): Promise<T> {
    return prisma.$transaction(async (tx) => {
      await setActor(tx, ctx.actorId)
      await lockSettlement(tx, ctx.htxCode)
      return work(unitOf(tx))
    }, TX_OPTIONS)
  }

  async listPeriods(htxProfileId: string) {
    const rows = await prisma.settlementPeriod.findMany({ where: { htx_profile_id: htxProfileId }, orderBy: { date_to: 'desc' } })
    return rows.map(periodView)
  }

  async getPeriod(htxProfileId: string, id: string) {
    const row = await prisma.settlementPeriod.findFirst({ where: { id, htx_profile_id: htxProfileId } })
    if (!row) return null
    return { ...periodView(row), record: { id: row.id, code: row.code, date_from: dayString(row.date_from), date_to: dayString(row.date_to), status: row.status } }
  }

  async closedLines(htxProfileId: string, periodId: string) {
    const rows = await prisma.memberSettlement.findMany({ where: { period_id: periodId, period: { htx_profile_id: htxProfileId } }, include: LINE_INCLUDE, orderBy: [{ household: { name: 'asc' } }, { id: 'asc' }] })
    return rows.map(lineView)
  }

  preview(htxProfileId: string, dateTo: string) {
    return collectSlips(prisma, htxProfileId, dateTo, false)
  }

  async payLine(input: { htxProfileId: string; htxCode: string; periodId: string; lineId: string; method: PaymentMethod; ref: string | null; userId: string; at: Date }): Promise<PayoutOutcome> {
    return prisma.$transaction(async (tx) => {
      await setActor(tx, input.userId)
      await lockSettlement(tx, input.htxCode)
      const line = await tx.memberSettlement.findFirst({ where: { id: input.lineId, period_id: input.periodId, period: { htx_profile_id: input.htxProfileId } }, include: LINE_INCLUDE })
      if (!line) return { kind: 'not_found' }
      if (line.payable_vnd <= ZERO) return { kind: 'nothing_to_pay' }
      // The conditional write decides: of two callers, one updates a row and the other updates none.
      const done = await tx.memberSettlement.updateMany({
        where: { id: line.id, paid_at: null, payable_vnd: { gt: ZERO } },
        data: { paid_at: input.at, paid_by_id: input.userId, payment_method: input.method, payment_ref: input.ref },
      })
      if (done.count !== 1) return { kind: 'already_paid' }
      await tx.memberLedgerEntry.create({
        data: { htx_profile_id: input.htxProfileId, household_id: line.household_id, entry_type: 'PAYOUT', amount_vnd: -line.payable_vnd, settlement_id: line.id, note: input.ref, created_by_id: input.userId },
      })
      const paid = await tx.memberSettlement.findUniqueOrThrow({ where: { id: line.id }, include: LINE_INCLUDE })
      return { kind: 'paid', line: lineView(paid) }
    }, TX_OPTIONS)
  }

  async slipSource(htxProfileId: string, periodId: string, lineId: string): Promise<SlipSource | null> {
    const line = await prisma.memberSettlement.findFirst({
      where: { id: lineId, period_id: periodId, period: { htx_profile_id: htxProfileId } },
      include: { ...LINE_INCLUDE, household: { select: { id: true, name: true, keycloak_user_id: true, bank_bin: true, bank_account: true, bank_account_name: true } }, period: true },
    })
    if (!line) return null
    const [htx, tickets, advances] = await Promise.all([
      prisma.htxProfile.findUniqueOrThrow({ where: { id: htxProfileId }, select: { name: true, htx_code: true } }),
      prisma.freshLeafTicket.findMany({ where: { settlement_id: line.id }, include: TICKET_INCLUDE, orderBy: [{ weighed_at: 'asc' }, { id: 'asc' }] }),
      prisma.inputAdvance.findMany({ where: { settlement_id: line.id }, include: ADVANCE_INCLUDE, orderBy: [{ advanced_on: 'asc' }, { id: 'asc' }] }),
    ])
    return {
      htx: { name: htx.name, code: htx.htx_code },
      household: line.household,
      period: periodView(line.period),
      line: lineView(line),
      tickets: tickets.map(ticketView),
      advances: advances.map(advanceView),
    }
  }

  async addAdjustment(input: { htxProfileId: string; htxCode: string; householdId: string; amountVnd: bigint; reason: string; userId: string }) {
    return prisma.$transaction(async (tx) => {
      await setActor(tx, input.userId)
      await lockSettlement(tx, input.htxCode)
      const household = await tx.household.findFirst({ where: { id: input.householdId, htx_profile_id: input.htxProfileId }, select: { id: true } })
      if (!household) return null
      const row = await tx.memberLedgerEntry.create({
        data: { htx_profile_id: input.htxProfileId, household_id: household.id, entry_type: 'ADJUSTMENT', amount_vnd: input.amountVnd, note: input.reason, created_by_id: input.userId },
      })
      return entryView(row)
    }, TX_OPTIONS)
  }
}
