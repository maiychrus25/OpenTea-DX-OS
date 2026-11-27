// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'
import type { LeafGradeView, LeafPricePort, TodayPrices } from '@/domain/weighing/ports/LeafPricePort'

const DAY_MS = 24 * 60 * 60 * 1000
/** `price_date` is a Postgres DATE: a Vietnam calendar day is stored as that day at 00:00 UTC. */
const dateOf = (day: string) => new Date(`${day}T00:00:00Z`)
const dayBefore = (day: string) => new Date(dateOf(day).getTime() - DAY_MS)

const gradeView = (g: { id: string; name: string; sort_order: number; active: boolean }): LeafGradeView => ({
  id: g.id,
  name: g.name,
  sort_order: g.sort_order,
  active: g.active,
})

export class PrismaLeafPriceRepository implements LeafPricePort {
  async listGrades(htxProfileId: string): Promise<LeafGradeView[]> {
    const rows = await prisma.leafGrade.findMany({ where: { htx_profile_id: htxProfileId }, orderBy: [{ sort_order: 'asc' }, { name: 'asc' }] })
    return rows.map(gradeView)
  }

  async createGrade(htxProfileId: string, input: { name: string; sort_order?: number }): Promise<LeafGradeView> {
    let sortOrder = input.sort_order
    if (sortOrder === undefined) {
      const last = await prisma.leafGrade.aggregate({ where: { htx_profile_id: htxProfileId }, _max: { sort_order: true } })
      sortOrder = (last._max.sort_order ?? 0) + 1
    }
    return gradeView(await prisma.leafGrade.create({ data: { htx_profile_id: htxProfileId, name: input.name, sort_order: sortOrder } }))
  }

  async updateGrade(htxProfileId: string, id: string, input: { name?: string; sort_order?: number; active?: boolean }): Promise<LeafGradeView | null> {
    const own = await prisma.leafGrade.findFirst({ where: { id, htx_profile_id: htxProfileId }, select: { id: true } })
    if (!own) return null
    return gradeView(await prisma.leafGrade.update({ where: { id }, data: input }))
  }

  async pricesFor(htxProfileId: string, day: string): Promise<TodayPrices> {
    const [grades, today, yesterday] = await Promise.all([
      prisma.leafGrade.findMany({ where: { htx_profile_id: htxProfileId, active: true }, orderBy: [{ sort_order: 'asc' }, { name: 'asc' }] }),
      prisma.dailyLeafPrice.findMany({ where: { htx_profile_id: htxProfileId, price_date: dateOf(day) } }),
      prisma.dailyLeafPrice.findMany({ where: { htx_profile_id: htxProfileId, price_date: dayBefore(day) } }),
    ])
    const todayBy = new Map(today.map((p) => [p.grade_id, p]))
    const yesterdayBy = new Map(yesterday.map((p) => [p.grade_id, p.price_vnd_per_kg]))
    const latest = today.reduce<Date | null>((max, p) => (!max || p.published_at > max ? p.published_at : max), null)
    return {
      date: day,
      published_at: latest ? latest.toISOString() : null,
      prices: grades.map((g) => ({
        grade_id: g.id,
        grade_name: g.name,
        price_vnd_per_kg: todayBy.get(g.id)?.price_vnd_per_kg ?? null,
        yesterday_vnd_per_kg: yesterdayBy.get(g.id) ?? null,
      })),
    }
  }

  async upsertPrices(input: { htxProfileId: string; day: string; publishedById: string; prices: { grade_id: string; price_vnd_per_kg: number }[]; at: Date }): Promise<boolean> {
    const ids = Array.from(new Set(input.prices.map((p) => p.grade_id)))
    // Checked before the transaction opens, so a foreign or hidden grade writes nothing.
    const grades = await prisma.leafGrade.count({ where: { id: { in: ids }, htx_profile_id: input.htxProfileId, active: true } })
    if (grades !== ids.length) return false
    return prisma.$transaction(async (tx) => {
      for (const p of input.prices) {
        await tx.dailyLeafPrice.upsert({
          where: { grade_id_price_date: { grade_id: p.grade_id, price_date: dateOf(input.day) } },
          create: { htx_profile_id: input.htxProfileId, grade_id: p.grade_id, price_date: dateOf(input.day), price_vnd_per_kg: p.price_vnd_per_kg, published_by_id: input.publishedById, published_at: input.at },
          update: { price_vnd_per_kg: p.price_vnd_per_kg, published_by_id: input.publishedById, published_at: input.at },
        })
      }
      return true
    })
  }
}
