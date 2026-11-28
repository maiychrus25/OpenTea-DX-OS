// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { Prisma } from '@prisma/client'
import { prisma } from '@/infrastructure/db/prisma.client'
import type { SprayEntry } from '@/domain/journal/blocking-sprays'
import { WITHDRAWAL_EXCLUDED_STATUSES } from '@/domain/journal/withdrawal-status'
import type {
  FreshLeafTicketPort,
  LockedParcel,
  NewTicket,
  TicketFilter,
  TicketUnit,
  TicketView,
  VoidOutcome,
} from '@/domain/weighing/ports/FreshLeafTicketPort'
import { vnDayStart } from '@/application/agent/campaign/vn-day'

const DAY_MS = 24 * 60 * 60 * 1000
const PAGE_SIZE = 50
const dateOf = (day: string) => new Date(`${day}T00:00:00Z`)

const INCLUDE = {
  household: { select: { name: true, keycloak_user_id: true } },
  parcel: { select: { parcel_code: true } },
  grade: { select: { name: true } },
  cycle: { select: { season: true } },
} satisfies Prisma.FreshLeafTicketInclude

type TicketRow = Prisma.FreshLeafTicketGetPayload<{ include: typeof INCLUDE }>

function view(row: TicketRow): TicketView {
  return {
    id: row.id,
    ticket_no: row.ticket_no,
    household_id: row.household_id,
    household_name: row.household.name,
    parcel_id: row.parcel_id,
    parcel_code: row.parcel.parcel_code,
    cycle_id: row.cycle_id,
    cycle_season: row.cycle?.season ?? null,
    grade_id: row.grade_id,
    grade_name: row.grade.name,
    weighed_at: row.weighed_at.toISOString(),
    gross_kg: Number(row.gross_kg),
    deduction_pct: Number(row.deduction_pct),
    net_kg: Number(row.net_kg),
    price_vnd_per_kg: row.price_vnd_per_kg,
    amount_vnd: row.amount_vnd.toString(),
    status: row.status,
    void_reason: row.void_reason,
    settlement_id: row.settlement_id,
  }
}

/** Sprayings of the parcel by `asOf` that are still inside their withdrawal then; the domain rule judges them. */
async function readSprays(db: Pick<Prisma.TransactionClient, 'journalEntry'>, parcelId: string, asOf: Date): Promise<SprayEntry[]> {
  return db.journalEntry.findMany({
    where: {
      parcel_id: parcelId,
      status: { notIn: [...WITHDRAWAL_EXCLUDED_STATUSES] },
      entry_date: { lte: asOf },
      activities: { some: { safe_harvest_date: { gt: asOf } } },
    },
    select: { status: true, entry_date: true, cycle_id: true, activities: { where: { safe_harvest_date: { gt: asOf } }, select: { safe_harvest_date: true } } },
  })
}

export { INCLUDE as TICKET_INCLUDE, view as ticketView }

function unitOf(tx: Prisma.TransactionClient): TicketUnit {
  return {
    async lockParcel(parcelId) {
      const rows = await tx.$queryRaw<LockedParcel[]>`
        SELECT p.id, p.parcel_code, p.status::text AS status, p.household_id, h.htx_profile_id
        FROM parcels p JOIN households h ON h.id = p.household_id
        WHERE p.id = ${parcelId} FOR UPDATE OF p`
      return rows[0] ?? null
    },
    sprayEntries: (parcelId, asOf) => readSprays(tx, parcelId, asOf),
    async gradeOf(htxProfileId, gradeId) {
      return tx.leafGrade.findFirst({ where: { id: gradeId, htx_profile_id: htxProfileId }, select: { id: true, name: true, active: true } })
    },
    async priceOf(gradeId, day) {
      const row = await tx.dailyLeafPrice.findUnique({ where: { grade_id_price_date: { grade_id: gradeId, price_date: dateOf(day) } }, select: { price_vnd_per_kg: true } })
      return row?.price_vnd_per_kg ?? null
    },
    async cycleIdFor(parcelId) {
      const cycles = await tx.parcelCropCycle.findMany({ where: { parcel_id: parcelId }, select: { id: true, harvested_at: true, created_at: true } })
      const newest = [...cycles].sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
      const open = newest.find((c) => !c.harvested_at)
      if (open) return open.id
      const closed = [...cycles].sort((a, b) => (b.harvested_at?.getTime() ?? 0) - (a.harvested_at?.getTime() ?? 0) || b.created_at.getTime() - a.created_at.getTime())
      return closed[0]?.id ?? null
    },
    async nextTicketNo(htxCode, day) {
      // One writer per HTX and day takes a number at a time; the lock ends with the transaction.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`leaf-ticket:${htxCode}:${day}`}))`
      const prefix = `${htxCode}-PC-${day.replace(/-/g, '')}-`
      const rows = await tx.$queryRaw<{ n: number }[]>`
        SELECT COALESCE(MAX(substring(ticket_no from '[0-9]+$')::int), 0) + 1 AS n
        FROM fresh_leaf_tickets WHERE left(ticket_no, ${prefix.length}::int) = ${prefix}`
      return `${prefix}${String(rows[0].n).padStart(3, '0')}`
    },
    async insert(ticket: NewTicket) {
      const row = await tx.freshLeafTicket.create({
        data: {
          htx_profile_id: ticket.htx_profile_id,
          ticket_no: ticket.ticket_no,
          household_id: ticket.household_id,
          parcel_id: ticket.parcel_id,
          cycle_id: ticket.cycle_id,
          grade_id: ticket.grade_id,
          weighed_at: ticket.weighed_at,
          gross_kg: ticket.gross_kg.toFixed(1),
          deduction_pct: ticket.deduction_pct.toFixed(1),
          net_kg: ticket.net_kg.toFixed(1),
          price_vnd_per_kg: ticket.price_vnd_per_kg,
          amount_vnd: ticket.amount_vnd,
          created_by_id: ticket.created_by_id,
          client_id: ticket.client_id,
        },
        include: INCLUDE,
      })
      return view(row)
    },
  }
}

export class PrismaFreshLeafTicketRepository implements FreshLeafTicketPort {
  inTicketTransaction<T>(work: (unit: TicketUnit) => Promise<T>): Promise<T> {
    return prisma.$transaction((tx) => work(unitOf(tx)))
  }

  async findByClientId(createdById: string, clientId: string): Promise<TicketView | null> {
    const row = await prisma.freshLeafTicket.findUnique({ where: { created_by_id_client_id: { created_by_id: createdById, client_id: clientId } }, include: INCLUDE })
    return row ? view(row) : null
  }

  async voidTicket(input: { htxProfileId: string; id: string; reason: string; userId: string; at: Date }): Promise<VoidOutcome> {
    // One conditional write: a ticket that was settled, voided or put into a batch meanwhile is not touched.
    const done = await prisma.freshLeafTicket.updateMany({
      where: { id: input.id, htx_profile_id: input.htxProfileId, status: 'VALID', settlement_id: null, processing_batch_id: null },
      data: { status: 'VOIDED', void_reason: input.reason, voided_by_id: input.userId, voided_at: input.at },
    })
    const row = await prisma.freshLeafTicket.findFirst({ where: { id: input.id, htx_profile_id: input.htxProfileId }, include: INCLUDE })
    if (!row) return { kind: 'not_found' }
    if (done.count === 1) return { kind: 'voided', ticket: view(row) }
    if (row.settlement_id) return { kind: 'settled' }
    if (row.processing_batch_id) {
      const batch = await prisma.processingBatch.findUnique({ where: { id: row.processing_batch_id }, select: { batch_code: true } })
      return { kind: 'in_batch', batch_code: batch?.batch_code ?? '' }
    }
    return { kind: 'already_voided' }
  }

  async parcelOf(htxProfileId: string, parcelId: string) {
    return prisma.parcel.findFirst({ where: { id: parcelId, household: { htx_profile_id: htxProfileId } }, select: { id: true, parcel_code: true } })
  }

  sprayEntries(parcelId: string, asOf: Date): Promise<SprayEntry[]> {
    return readSprays(prisma, parcelId, asOf)
  }

  async get(htxProfileId: string, id: string) {
    const row = await prisma.freshLeafTicket.findFirst({ where: { id, htx_profile_id: htxProfileId }, include: INCLUDE })
    return row ? { ...view(row), household_keycloak_user_id: row.household.keycloak_user_id } : null
  }

  async list(filter: TicketFilter) {
    const where: Prisma.FreshLeafTicketWhereInput = { htx_profile_id: filter.htxProfileId }
    if (filter.day) where.weighed_at = { gte: vnDayStart(filter.day), lt: new Date(vnDayStart(filter.day).getTime() + DAY_MS) }
    if (filter.householdId) where.household_id = filter.householdId
    if (filter.status) where.status = filter.status
    const [rows, sums] = await Promise.all([
      prisma.freshLeafTicket.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ weighed_at: 'desc' }, { id: 'desc' }],
        take: PAGE_SIZE + 1,
        ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      }),
      // Totals cover every valid ticket of the filter, not only the page.
      this.totals(where),
    ])
    const page = rows.slice(0, PAGE_SIZE)
    return { data: page.map(view), next_cursor: rows.length > PAGE_SIZE ? page[page.length - 1].id : null, totals: sums }
  }

  private async totals(where: Prisma.FreshLeafTicketWhereInput): Promise<{ net_kg: number; amount_vnd: string }> {
    const sum = await prisma.freshLeafTicket.aggregate({ where: { ...where, status: 'VALID' }, _sum: { net_kg: true, amount_vnd: true } })
    return { net_kg: Number(sum._sum.net_kg ?? 0), amount_vnd: (sum._sum.amount_vnd ?? BigInt(0)).toString() }
  }

  async mine(htxProfileId: string, keycloakUserId: string): Promise<TicketView[]> {
    const rows = await prisma.freshLeafTicket.findMany({
      where: { htx_profile_id: htxProfileId, household: { keycloak_user_id: keycloakUserId, htx_profile_id: htxProfileId } },
      include: INCLUDE,
      orderBy: [{ weighed_at: 'desc' }, { id: 'desc' }],
      take: 200,
    })
    return rows.map(view)
  }

  async listRange(htxProfileId: string, fromDay: string, toDay: string, max: number): Promise<TicketView[]> {
    const rows = await prisma.freshLeafTicket.findMany({
      where: { htx_profile_id: htxProfileId, weighed_at: { gte: vnDayStart(fromDay), lt: new Date(vnDayStart(toDay).getTime() + DAY_MS) } },
      include: INCLUDE,
      orderBy: [{ weighed_at: 'asc' }, { id: 'asc' }],
      take: max,
    })
    return rows.map(view)
  }

  async searchHouseholds(htxProfileId: string, q: string) {
    const text = q.trim()
    const rows = await prisma.household.findMany({
      where: {
        htx_profile_id: htxProfileId,
        ...(text ? { OR: [{ name: { contains: text, mode: 'insensitive' } }, { phone: { contains: text } }] } : {}),
      },
      select: { id: true, name: true, phone: true, parcels: { where: { status: { not: 'DRAFT' } }, select: { id: true, parcel_code: true }, orderBy: { parcel_code: 'asc' } } },
      orderBy: { name: 'asc' },
      take: 20,
    })
    return rows
  }

  async weighingSummary(htxProfileId: string, cycleId: string) {
    const [tickets, journal] = await Promise.all([
      prisma.freshLeafTicket.aggregate({ where: { htx_profile_id: htxProfileId, cycle_id: cycleId, status: 'VALID' }, _sum: { net_kg: true } }),
      prisma.journalActivity.aggregate({
        where: { journal_entry: { cycle_id: cycleId, status: { notIn: [...WITHDRAWAL_EXCLUDED_STATUSES] } }, fresh_leaf_kg: { not: null } },
        _sum: { fresh_leaf_kg: true },
      }),
    ])
    return { ticket_net_kg: Number(tickets._sum.net_kg ?? 0), journal_fresh_leaf_kg: Number(journal._sum.fresh_leaf_kg ?? 0) }
  }
}
