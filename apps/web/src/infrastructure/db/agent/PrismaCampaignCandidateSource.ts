// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { CandidateSource } from '@/application/agent/campaign/CampaignCandidatesUseCase'
import { vnDayOf, vnDayStart } from '@/application/agent/campaign/vn-day'
import { prisma } from '@/infrastructure/db/prisma.client'

const RAIN_MM = 5
const RAIN_WINDOW_MS = 12 * 60 * 60 * 1000

/**
 * Facts A9's rules read, each scoped to one cooperative. Weather is cached per day, so the 12-hour window
 * takes today's row and any row that starts within twelve hours (documented in rules-and-limits).
 */
export class PrismaCampaignCandidateSource implements CandidateSource {
  async rainParcelCodes(htxCode: string, now: Date): Promise<string[]> {
    const rows = await prisma.weatherCache.findMany({
      where: {
        recorded_at: { gte: vnDayStart(vnDayOf(now)), lte: new Date(now.getTime() + RAIN_WINDOW_MS) },
        parcel: { household: { htx_profile: { htx_code: htxCode } } },
      },
      select: { precipitation_mm: true, parcel: { select: { parcel_code: true } } },
    })
    const wettest = new Map<string, number>()
    for (const row of rows) {
      const code = row.parcel.parcel_code
      wettest.set(code, Math.max(wettest.get(code) ?? 0, row.precipitation_mm))
    }
    return Array.from(wettest).filter(([, mm]) => mm >= RAIN_MM).map(([code]) => code)
  }

  async withdrawalRows(htxCode: string, since: Date): Promise<{ parcel_code: string; safe_harvest_date: Date }[]> {
    const rows = await prisma.journalActivity.findMany({
      where: {
        safe_harvest_date: { gt: since },
        journal_entry: {
          activity_type: 'SPRAYING',
          status: { not: 'DRAFT' },
          parcel: { household: { htx_profile: { htx_code: htxCode } } },
        },
      },
      select: { safe_harvest_date: true, journal_entry: { select: { parcel: { select: { parcel_code: true } } } } },
    })
    return rows.flatMap((row) =>
      row.safe_harvest_date ? [{ parcel_code: row.journal_entry.parcel.parcel_code, safe_harvest_date: row.safe_harvest_date }] : []
    )
  }

  async parcelCodesByIds(htxCode: string, parcelIds: string[]): Promise<Map<string, string>> {
    const parcels = await prisma.parcel.findMany({
      where: { id: { in: parcelIds }, household: { htx_profile: { htx_code: htxCode } } },
      select: { id: true, parcel_code: true },
    })
    return new Map(parcels.map((p) => [p.id, p.parcel_code]))
  }

  async estimatedKgByParcelIds(htxCode: string, parcelIds: string[]): Promise<Map<string, number>> {
    const parcels = await prisma.parcel.findMany({
      where: { id: { in: parcelIds }, household: { htx_profile: { htx_code: htxCode } } },
      select: { id: true, area_ha: true, estimated_yield_per_ha: true },
    })
    return new Map(
      parcels.flatMap((p) => (p.estimated_yield_per_ha === null ? [] : [[p.id, p.area_ha * p.estimated_yield_per_ha] as [string, number]]))
    )
  }

  async staffPresent(htxCode: string, day: string): Promise<number | null> {
    const rows = await prisma.$queryRaw<{ present: number }[]>`
      SELECT present FROM platform.staff_attendance WHERE htx_code = ${htxCode} AND day = ${day}::date
    `
    return rows[0]?.present ?? null
  }

  async parcelCodesOfEntries(htxCode: string, entryIds: string[]): Promise<Map<string, string>> {
    const entries = await prisma.journalEntry.findMany({
      where: { id: { in: entryIds }, parcel: { household: { htx_profile: { htx_code: htxCode } } } },
      select: { id: true, parcel: { select: { parcel_code: true } } },
    })
    return new Map(entries.map((e) => [e.id, e.parcel.parcel_code]))
  }
}
