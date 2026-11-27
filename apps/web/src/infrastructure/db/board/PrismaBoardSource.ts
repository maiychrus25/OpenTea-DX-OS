// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'
import { WITHDRAWAL_EXCLUDED_STATUSES } from '@/domain/journal/withdrawal-status'
import type { BoardSource } from '@/domain/board/ports/BoardSource'
import { DRY_TEA_GRADES, type DryTeaGrade } from '@/domain/processing/grades'
import { PrismaLeafPriceRepository } from '@/infrastructure/db/weighing/PrismaLeafPriceRepository'
import { endOfVnDay, weighingBlock } from '@/application/weighing/withdrawal-gate'

const ZERO = BigInt(0)
const dateOf = (day: string) => new Date(`${day}T00:00:00Z`)

/** Kg left per output: what the batch made minus what lots took, as in `stockOf` of the lot-from-batches repository. */
const LEFT_PER_OUTPUT = `
  SELECT o.id, o.grade, o.kg - COALESCE(t.taken, 0) AS left_kg, b.processed_on
  FROM processing_batch_outputs o
  JOIN processing_batches b ON b.id = o.batch_id
  LEFT JOIN (SELECT output_id, SUM(kg) AS taken FROM lot_batch_sources GROUP BY output_id) t ON t.output_id = o.id
  WHERE b.htx_profile_id = $1 AND b.status = 'FINISHED'`

export class PrismaBoardSource implements BoardSource {
  private readonly leafPrices = new PrismaLeafPriceRepository()

  async leafBetween(htxProfileId: string, from: Date, to: Date) {
    const sum = await prisma.freshLeafTicket.aggregate({
      where: { htx_profile_id: htxProfileId, status: 'VALID', weighed_at: { gte: from, lt: to } },
      _sum: { net_kg: true, amount_vnd: true },
      _count: { _all: true },
    })
    return { net_kg: Number(sum._sum.net_kg ?? 0), amount_vnd: sum._sum.amount_vnd ?? ZERO, tickets: sum._count._all }
  }

  async prices(htxProfileId: string, day: string) {
    const today = await this.leafPrices.pricesFor(htxProfileId, day)
    const grades = today.prices.flatMap((p) => (p.price_vnd_per_kg === null ? [] : [{ grade_id: p.grade_id, grade_name: p.grade_name, price_vnd_per_kg: p.price_vnd_per_kg }]))
    return { published: grades.length > 0, grades }
  }

  async payable(htxProfileId: string) {
    const [lines, tickets, advances] = await Promise.all([
      prisma.memberSettlement.aggregate({ where: { paid_at: null, payable_vnd: { gt: ZERO }, period: { htx_profile_id: htxProfileId, status: 'CLOSED' } }, _sum: { payable_vnd: true } }),
      prisma.freshLeafTicket.aggregate({ where: { htx_profile_id: htxProfileId, status: 'VALID', settlement_id: null }, _sum: { amount_vnd: true } }),
      prisma.inputAdvance.aggregate({ where: { htx_profile_id: htxProfileId, status: 'VALID', settlement_id: null }, _sum: { amount_vnd: true } }),
    ])
    return { unpaid_lines_vnd: lines._sum.payable_vnd ?? ZERO, unsettled_leaf_vnd: tickets._sum.amount_vnd ?? ZERO, unsettled_advances_vnd: advances._sum.amount_vnd ?? ZERO }
  }

  async dryStock(htxProfileId: string) {
    const rows = await prisma.$queryRawUnsafe<{ grade: DryTeaGrade; kg: string }[]>(
      `SELECT grade::text AS grade, SUM(left_kg)::text AS kg FROM (${LEFT_PER_OUTPUT}) s WHERE left_kg > 0 GROUP BY grade`,
      htxProfileId,
    )
    const byGrade = new Map(rows.map((r) => [r.grade, Number(r.kg)]))
    return DRY_TEA_GRADES.map((grade) => ({ grade, kg: byGrade.get(grade) ?? 0 }))
  }

  async parcelsInWithdrawal(htxProfileId: string, day: string) {
    const end = endOfVnDay(day)
    const entries = await prisma.journalEntry.findMany({
      where: {
        parcel: { household: { htx_profile_id: htxProfileId } },
        status: { notIn: [...WITHDRAWAL_EXCLUDED_STATUSES] },
        entry_date: { lte: end },
        activities: { some: { safe_harvest_date: { gt: end } } },
      },
      select: { parcel_id: true, status: true, entry_date: true, cycle_id: true, activities: { where: { safe_harvest_date: { gt: end } }, select: { safe_harvest_date: true } } },
    })
    const byParcel = new Map<string, typeof entries>()
    for (const entry of entries) byParcel.set(entry.parcel_id, [...(byParcel.get(entry.parcel_id) ?? []), entry])
    return Array.from(byParcel.values()).filter((list) => weighingBlock(list, day) !== null).length
  }

  outOfBandBatchesSince(htxProfileId: string, since: Date) {
    return prisma.processingBatch.count({ where: { htx_profile_id: htxProfileId, status: 'FINISHED', out_of_band: true, finished_at: { gte: since } } })
  }

  openBatchesOnOrBefore(htxProfileId: string, day: string) {
    return prisma.processingBatch.count({ where: { htx_profile_id: htxProfileId, status: 'OPEN', processed_on: { lte: dateOf(day) } } })
  }

  async stockRowsOnOrBefore(htxProfileId: string, day: string) {
    const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(`SELECT COUNT(*)::int AS n FROM (${LEFT_PER_OUTPUT}) s WHERE left_kg > 0 AND processed_on <= $2::date`, htxProfileId, day)
    return rows[0]?.n ?? 0
  }

  draftPeriods(htxProfileId: string) {
    return prisma.settlementPeriod.findMany({ where: { htx_profile_id: htxProfileId, status: 'DRAFT' }, select: { id: true, code: true }, orderBy: [{ date_from: 'desc' }, { id: 'asc' }] })
  }

  unpaidLinesClosedBefore(htxProfileId: string, before: Date) {
    return prisma.memberSettlement.count({ where: { paid_at: null, payable_vnd: { gt: ZERO }, period: { htx_profile_id: htxProfileId, status: 'CLOSED', closed_at: { lt: before } } } })
  }
}
