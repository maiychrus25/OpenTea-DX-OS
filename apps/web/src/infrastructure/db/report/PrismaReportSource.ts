// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'
import type { ReportRange, ReportSource } from '@/domain/report/ports/ReportSource'
import { DRY_TEA_GRADES, type DryTeaGrade } from '@/domain/processing/grades'
import { vnDayOf } from '@/application/agent/campaign/vn-day'
import { NotFoundError } from '@/domain/errors'

const ZERO = BigInt(0)
const dateOf = (day: string) => new Date(`${day}T00:00:00Z`)

export class PrismaReportSource implements ReportSource {
  async htxName(htxProfileId: string) {
    const htx = await prisma.htxProfile.findUnique({ where: { id: htxProfileId }, select: { name: true } })
    if (!htx) throw new NotFoundError('HTX không tồn tại')
    return htx.name
  }

  async members(htxProfileId: string) {
    const [households, parcels] = await Promise.all([
      prisma.household.count({ where: { htx_profile_id: htxProfileId } }),
      prisma.parcel.aggregate({ where: { household: { htx_profile_id: htxProfileId } }, _count: { _all: true }, _sum: { area_ha: true } }),
    ])
    return { households, parcels: parcels._count._all, area_ha: Math.round((parcels._sum.area_ha ?? 0) * 100) / 100 }
  }

  async purchases(htxProfileId: string, range: ReportRange) {
    // weighed_at is a timestamp without zone that holds UTC; SUM of bigint is numeric, so it is cast back.
    const [months, grades] = await Promise.all([
      prisma.$queryRaw<{ month: string; net_kg: string; amount: bigint; tickets: number }[]>`
        SELECT to_char((weighed_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM') AS month, SUM(net_kg)::text AS net_kg, SUM(amount_vnd)::bigint AS amount, COUNT(*)::int AS tickets
        FROM fresh_leaf_tickets
        WHERE htx_profile_id = ${htxProfileId} AND status = 'VALID' AND weighed_at >= ${range.start} AND weighed_at < ${range.end}
        GROUP BY 1 ORDER BY 1`,
      prisma.$queryRaw<{ grade_name: string; net_kg: string; amount: bigint }[]>`
        SELECT g.name AS grade_name, SUM(t.net_kg)::text AS net_kg, SUM(t.amount_vnd)::bigint AS amount
        FROM fresh_leaf_tickets t JOIN leaf_grades g ON g.id = t.grade_id
        WHERE t.htx_profile_id = ${htxProfileId} AND t.status = 'VALID' AND t.weighed_at >= ${range.start} AND t.weighed_at < ${range.end}
        GROUP BY g.id, g.name, g.sort_order ORDER BY g.sort_order, g.name`,
    ])
    return {
      months: months.map((m) => ({ month: m.month, net_kg: Number(m.net_kg), amount_vnd: m.amount, tickets: m.tickets })),
      by_grade: grades.map((g) => ({ grade_name: g.grade_name, net_kg: Number(g.net_kg), amount_vnd: g.amount })),
    }
  }

  async memberMoney(htxProfileId: string, range: ReportRange) {
    const period = { htx_profile_id: htxProfileId, status: 'CLOSED' as const, closed_at: { gte: range.start, lt: range.end } }
    const [periods, paid, open, advances] = await Promise.all([
      prisma.settlementPeriod.count({ where: period }),
      prisma.memberSettlement.aggregate({ where: { paid_at: { not: null }, period }, _sum: { payable_vnd: true } }),
      prisma.memberSettlement.aggregate({ where: { paid_at: null, payable_vnd: { gt: ZERO }, period }, _sum: { payable_vnd: true } }),
      prisma.inputAdvance.aggregate({ where: { htx_profile_id: htxProfileId, status: 'VALID', advanced_on: { gte: dateOf(range.from), lte: dateOf(range.to) } }, _sum: { amount_vnd: true } }),
    ])
    return { periods_closed: periods, paid_vnd: paid._sum.payable_vnd ?? ZERO, payable_open_vnd: open._sum.payable_vnd ?? ZERO, advances_vnd: advances._sum.amount_vnd ?? ZERO }
  }

  async processing(htxProfileId: string, range: ReportRange) {
    const batch = { htx_profile_id: htxProfileId, status: 'FINISHED' as const, finished_at: { gte: range.start, lt: range.end } }
    const [sum, outOfBand, outputs] = await Promise.all([
      prisma.processingBatch.aggregate({ where: batch, _count: { _all: true }, _sum: { fresh_kg: true, dry_kg: true } }),
      prisma.processingBatch.count({ where: { ...batch, out_of_band: true } }),
      prisma.processingBatchOutput.groupBy({ by: ['grade'], where: { batch }, _sum: { kg: true } }),
    ])
    const byGrade = new Map<DryTeaGrade, number>(outputs.map((o) => [o.grade, Number(o._sum.kg ?? 0)]))
    return {
      batches: sum._count._all,
      fresh_kg: Number(sum._sum.fresh_kg ?? 0),
      dry_kg: Number(sum._sum.dry_kg ?? 0),
      out_of_band: outOfBand,
      by_grade: DRY_TEA_GRADES.map((grade) => ({ grade, kg: byGrade.get(grade) ?? 0 })),
    }
  }

  async lots(htxProfileId: string, range: ReportRange) {
    const [rows, certificates] = await Promise.all([
      // Phase 2 lots weigh what their batch sources took; older lots fall back to the weight typed on the lot.
      prisma.$queryRaw<{ lots: number; exported: number; kg: string }[]>`
        SELECT COUNT(*)::int AS lots, COUNT(*) FILTER (WHERE l.status = 'QR_EXPORTED')::int AS exported,
          COALESCE(SUM(COALESCE(s.kg, l.total_weight_kg, l.actual_weight_kg, 0)), 0)::text AS kg
        FROM lots l LEFT JOIN (SELECT lot_id, SUM(kg) AS kg FROM lot_batch_sources GROUP BY lot_id) s ON s.lot_id = l.id
        WHERE l.htx_profile_id = ${htxProfileId} AND l.created_at >= ${range.start} AND l.created_at < ${range.end}`,
      prisma.htxCertificate.findMany({
        where: { htx_profile_id: htxProfileId, revoked_at: null, issued_on: { lte: dateOf(range.to) }, expires_on: { gte: dateOf(range.to) } },
        select: { kind: true, number: true, issuer: true, expires_on: true },
        orderBy: [{ expires_on: 'asc' }, { id: 'asc' }],
      }),
    ])
    const r = rows[0]
    return {
      lots: r?.lots ?? 0,
      exported: r?.exported ?? 0,
      kg: Math.round(Number(r?.kg ?? 0) * 10) / 10,
      certificates_valid: certificates.map((c) => ({ kind: c.kind, number: c.number, issuer: c.issuer, expires_on: vnDayOf(c.expires_on) })),
    }
  }

  async safety(htxProfileId: string, range: ReportRange) {
    const [sprayings, harvests] = await Promise.all([
      prisma.journalEntry.count({ where: { activity_type: 'SPRAYING', status: 'APPROVED', entry_date: { gte: range.start, lt: range.end }, parcel: { household: { htx_profile_id: htxProfileId } } } }),
      prisma.parcelCropCycle.count({ where: { harvested_at: { gte: range.start, lt: range.end }, parcel: { household: { htx_profile_id: htxProfileId } } } }),
    ])
    return { sprayings_approved: sprayings, harvests_approved: harvests }
  }
}
