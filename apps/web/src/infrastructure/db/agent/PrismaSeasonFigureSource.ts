// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { SeasonFigureSource } from '@/application/agent/strategy/season-figures'
import { PrismaInstalledAppRepository } from '@/infrastructure/db/repositories/prisma-installed-app-repository'
import { prisma } from '@/infrastructure/db/prisma.client'

/** Season figures read from the farm tables and, when installed and enabled, the tea-shop schema. Read-only. */
export class PrismaSeasonFigureSource implements SeasonFigureSource {
  async yieldKg(htxCode: string, from: Date, to: Date): Promise<number | null> {
    const rows = await prisma.$queryRaw<{ kg: number | null }[]>`
      SELECT sum(COALESCE(l.actual_weight_kg, l.estimated_weight_kg))::float8 AS kg
      FROM lots l JOIN htx_profiles h ON h.id = l.htx_profile_id
      WHERE h.htx_code = ${htxCode} AND l.harvest_date >= ${from} AND l.harvest_date < ${to}
    `
    return rows[0]?.kg ?? null
  }

  async journalCounts(htxCode: string, from: Date, to: Date): Promise<{ total: number; onTime: number }> {
    const rows = await prisma.$queryRaw<{ total: number; on_time: number }[]>`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE e.created_at <= e.entry_date + interval '2 days')::int AS on_time
      FROM journal_entries e
      JOIN parcels p ON p.id = e.parcel_id
      JOIN households hh ON hh.id = p.household_id
      JOIN htx_profiles h ON h.id = hh.htx_profile_id
      WHERE h.htx_code = ${htxCode} AND e.entry_date >= ${from} AND e.entry_date < ${to}
    `
    return { total: rows[0]?.total ?? 0, onTime: rows[0]?.on_time ?? 0 }
  }

  async parcelCounts(htxCode: string, from: Date, to: Date): Promise<{ parcels: number; diseased: number }> {
    const rows = await prisma.$queryRaw<{ parcels: number; diseased: number }[]>`
      SELECT count(*)::int AS parcels,
             count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM disease_reports d
               WHERE d.parcel_id = p.id AND d.status = 'CONFIRMED'
                 AND d.detection_date >= ${from} AND d.detection_date < ${to}))::int AS diseased
      FROM parcels p
      JOIN households hh ON hh.id = p.household_id
      JOIN htx_profiles h ON h.id = hh.htx_profile_id
      WHERE h.htx_code = ${htxCode} AND p.created_at < ${to}
    `
    return { parcels: rows[0]?.parcels ?? 0, diseased: rows[0]?.diseased ?? 0 }
  }

  async shopRevenue(htxCode: string, from: Date, to: Date): Promise<number | null> {
    if (!(await new PrismaInstalledAppRepository().isEnabledFor('tea-shop', htxCode))) return null
    const present = await prisma.$queryRaw<{ found: boolean }[]>`
      SELECT to_regclass('app_tea_shop.orders') IS NOT NULL AS found
    `
    if (!present[0]?.found) return null
    const rows = await prisma.$queryRaw<{ vnd: number | null }[]>`
      SELECT sum(total_vnd)::float8 AS vnd FROM app_tea_shop.orders
      WHERE htx_code = ${htxCode} AND status <> 'CANCELLED' AND created_at >= ${from} AND created_at < ${to}
    `
    return rows[0]?.vnd ?? null
  }
}
