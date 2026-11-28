// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'
import { vnDayOf, vnDayStart } from '@/application/agent/campaign/vn-day'
import type { ForecastSource, ForecastWindowRow } from '@/domain/forecast/ports/ForecastSource'

const DAY_MS = 24 * 60 * 60 * 1000

export class PrismaForecastSource implements ForecastSource {
  async freshNorm(htxProfileId: string): Promise<number | null> {
    const rows = await prisma.$queryRaw<{ norm: unknown }[]>`
      SELECT s.thresholds -> 'fresh_norm_kg_per_ha_flush' AS norm
      FROM platform.agent_settings s
      JOIN htx_profiles h ON h.htx_code = s.htx_code
      WHERE h.id = ${htxProfileId} AND s.agent = 'cross-check'
    `
    const norm = Number(rows[0]?.norm)
    return Number.isFinite(norm) && norm > 0 ? norm : null
  }

  async windowParcels(htxProfileId: string, from: string, to: string): Promise<ForecastWindowRow[]> {
    const cycles = await prisma.parcelCropCycle.findMany({
      where: {
        harvested_at: null,
        estimated_harvest_date: { gte: vnDayStart(from), lt: new Date(vnDayStart(to).getTime() + DAY_MS) },
        parcel: { household: { htx_profile_id: htxProfileId } },
      },
      select: { parcel_id: true, estimated_harvest_date: true, parcel: { select: { parcel_code: true, area_ha: true } } },
    })
    if (cycles.length === 0) return []
    // Closed flushes with at least one valid ticket, newest first; a flush nobody weighed says nothing about yield.
    const closed = await prisma.parcelCropCycle.findMany({
      where: { harvested_at: { not: null }, parcel_id: { in: Array.from(new Set(cycles.map((c) => c.parcel_id))) }, leaf_tickets: { some: { status: 'VALID' } } },
      orderBy: { harvested_at: 'desc' },
      select: { id: true, parcel_id: true },
    })
    const sums = await prisma.freshLeafTicket.groupBy({
      by: ['cycle_id'],
      where: { cycle_id: { in: closed.map((c) => c.id) }, status: 'VALID' },
      _sum: { net_kg: true },
    })
    const kgOf = new Map(sums.map((s) => [s.cycle_id, Number(s._sum.net_kg ?? 0)]))
    const history = new Map<string, number[]>()
    for (const c of closed) history.set(c.parcel_id, [...(history.get(c.parcel_id) ?? []), kgOf.get(c.id) ?? 0])
    return cycles.map((c) => ({
      parcel_id: c.parcel_id,
      parcel_code: c.parcel.parcel_code,
      harvest_on: vnDayOf(c.estimated_harvest_date as Date),
      area_ha: c.parcel.area_ha,
      history: history.get(c.parcel_id) ?? [],
    }))
  }
}
