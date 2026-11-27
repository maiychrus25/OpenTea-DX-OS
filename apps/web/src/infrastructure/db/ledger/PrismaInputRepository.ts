// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { InputItem, Prisma } from '@prisma/client'
import { prisma } from '@/infrastructure/db/prisma.client'
import type { AdvanceFilter, AdvanceUnit, AdvanceVoidOutcome, InputItemPatch, InputPort, NewAdvance, NewInputItem } from '@/domain/ledger/ports/InputPort'
import type { InputItemView } from '@/domain/ledger/views'
import { ADVANCE_INCLUDE, advanceView, dateOf } from './views'

const PAGE_SIZE = 50

function itemView(row: InputItem): InputItemView {
  return { id: row.id, name: row.name, unit: row.unit, unit_price_vnd: row.unit_price_vnd, kind: row.kind, pesticide_product_id: row.pesticide_product_id, active: row.active }
}

function unitOf(tx: Prisma.TransactionClient): AdvanceUnit {
  return {
    householdOf: (htxProfileId, id) => tx.household.findFirst({ where: { id, htx_profile_id: htxProfileId }, select: { id: true, name: true } }),
    async itemOf(htxProfileId, id) {
      const row = await tx.inputItem.findFirst({ where: { id, htx_profile_id: htxProfileId } })
      return row ? itemView(row) : null
    },
    async nextAdvanceNo(htxCode, day) {
      // One writer per HTX and day takes a number at a time; the lock ends with the transaction.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`input-advance:${htxCode}:${day}`}))`
      const prefix = `${htxCode}-VT-${day.replace(/-/g, '')}-`
      const rows = await tx.$queryRaw<{ n: number }[]>`
        SELECT COALESCE(MAX(substring(advance_no from '[0-9]+$')::int), 0) + 1 AS n
        FROM input_advances WHERE left(advance_no, ${prefix.length}::int) = ${prefix}`
      return `${prefix}${String(rows[0].n).padStart(3, '0')}`
    },
    async insert(advance: NewAdvance) {
      const row = await tx.inputAdvance.create({
        data: {
          htx_profile_id: advance.htx_profile_id,
          advance_no: advance.advance_no,
          household_id: advance.household_id,
          item_id: advance.item_id,
          quantity: advance.quantity.toFixed(2),
          unit_price_vnd: advance.unit_price_vnd,
          amount_vnd: advance.amount_vnd,
          advanced_on: dateOf(advance.advanced_on),
          created_by_id: advance.created_by_id,
          client_id: advance.client_id,
        },
        include: ADVANCE_INCLUDE,
      })
      return advanceView(row)
    },
  }
}

export class PrismaInputRepository implements InputPort {
  async listItems(htxProfileId: string) {
    const rows = await prisma.inputItem.findMany({ where: { htx_profile_id: htxProfileId }, orderBy: [{ active: 'desc' }, { name: 'asc' }] })
    return rows.map(itemView)
  }

  async itemByName(htxProfileId: string, name: string) {
    const row = await prisma.inputItem.findUnique({ where: { htx_profile_id_name: { htx_profile_id: htxProfileId, name } } })
    return row ? itemView(row) : null
  }

  async itemById(htxProfileId: string, id: string) {
    const row = await prisma.inputItem.findFirst({ where: { id, htx_profile_id: htxProfileId } })
    return row ? itemView(row) : null
  }

  async createItem(htxProfileId: string, data: NewInputItem) {
    return itemView(await prisma.inputItem.create({ data: { ...data, htx_profile_id: htxProfileId } }))
  }

  async updateItem(htxProfileId: string, id: string, patch: InputItemPatch) {
    const done = await prisma.inputItem.updateMany({ where: { id, htx_profile_id: htxProfileId }, data: patch })
    return done.count === 1 ? this.itemById(htxProfileId, id) : null
  }

  async pesticideExists(productId: string) {
    return (await prisma.pesticideProduct.count({ where: { id: productId, active: true } })) > 0
  }

  inAdvanceTransaction<T>(work: (unit: AdvanceUnit) => Promise<T>): Promise<T> {
    return prisma.$transaction((tx) => work(unitOf(tx)))
  }

  async findAdvanceByClientId(createdById: string, clientId: string) {
    const row = await prisma.inputAdvance.findUnique({ where: { created_by_id_client_id: { created_by_id: createdById, client_id: clientId } }, include: ADVANCE_INCLUDE })
    return row ? advanceView(row) : null
  }

  async voidAdvance(input: { htxProfileId: string; id: string; reason: string; userId: string; at: Date }): Promise<AdvanceVoidOutcome> {
    // One conditional write: an advance that was settled or voided meanwhile is not touched.
    const done = await prisma.inputAdvance.updateMany({
      where: { id: input.id, htx_profile_id: input.htxProfileId, status: 'VALID', settlement_id: null },
      data: { status: 'VOIDED', void_reason: input.reason, voided_by_id: input.userId, voided_at: input.at },
    })
    const row = await prisma.inputAdvance.findFirst({ where: { id: input.id, htx_profile_id: input.htxProfileId }, include: ADVANCE_INCLUDE })
    if (!row) return { kind: 'not_found' }
    if (done.count === 1) return { kind: 'voided', advance: advanceView(row) }
    return row.settlement_id ? { kind: 'settled' } : { kind: 'already_voided' }
  }

  async listAdvances(filter: AdvanceFilter) {
    const where: Prisma.InputAdvanceWhereInput = { htx_profile_id: filter.htxProfileId }
    if (filter.householdId) where.household_id = filter.householdId
    if (filter.status) where.status = filter.status
    if (filter.from || filter.to) where.advanced_on = { ...(filter.from ? { gte: dateOf(filter.from) } : {}), ...(filter.to ? { lte: dateOf(filter.to) } : {}) }
    const [rows, sum] = await Promise.all([
      prisma.inputAdvance.findMany({
        where,
        include: ADVANCE_INCLUDE,
        orderBy: [{ advanced_on: 'desc' }, { created_at: 'desc' }, { id: 'desc' }],
        take: PAGE_SIZE + 1,
        ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      }),
      // Totals cover every valid advance of the filter, not only the page.
      prisma.inputAdvance.aggregate({ where: { ...where, status: 'VALID' }, _sum: { amount_vnd: true } }),
    ])
    const page = rows.slice(0, PAGE_SIZE)
    return { data: page.map(advanceView), next_cursor: rows.length > PAGE_SIZE ? page[page.length - 1].id : null, totals: { amount_vnd: (sum._sum.amount_vnd ?? BigInt(0)).toString() } }
  }

  async listAdvancesRange(htxProfileId: string, from: string, to: string, max: number) {
    const rows = await prisma.inputAdvance.findMany({
      where: { htx_profile_id: htxProfileId, advanced_on: { gte: dateOf(from), lte: dateOf(to) } },
      include: ADVANCE_INCLUDE,
      orderBy: [{ advanced_on: 'asc' }, { id: 'asc' }],
      take: max,
    })
    return rows.map(advanceView)
  }
}
