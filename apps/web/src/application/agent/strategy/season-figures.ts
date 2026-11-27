// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { quarterRange, type Figures } from '@/domain/agent/strategy'
import { PrismaSeasonFigureSource } from '@/infrastructure/db/agent/PrismaSeasonFigureSource'

/** The raw reads behind the figures (contract C2); each is scoped to one cooperative and a half-open instant range. */
export interface SeasonFigureSource {
  /** Sum of lot weights (actual, else estimated) harvested in the range; null when there are no weights. */
  yieldKg(htxCode: string, from: Date, to: Date): Promise<number | null>
  journalCounts(htxCode: string, from: Date, to: Date): Promise<{ total: number; onTime: number }>
  /** Parcels that existed by the end of the range, and those with a confirmed disease report in it. */
  parcelCounts(htxCode: string, from: Date, to: Date): Promise<{ parcels: number; diseased: number }>
  /** The shop's orders not cancelled in the range; null when tea-shop is not installed and enabled, or has no orders. */
  shopRevenue(htxCode: string, from: Date, to: Date): Promise<number | null>
}

const round1 = (value: number) => Math.round(value * 10) / 10

/** The figures of a quarter (`YYYY-Qn`); a figure with no rows is null (contract C2). */
export async function seasonFigures(
  htxCode: string,
  season: string,
  source: SeasonFigureSource = new PrismaSeasonFigureSource()
): Promise<Figures> {
  const { from, to } = quarterRange(season)
  const [yieldKg, journals, parcels, shop] = await Promise.all([
    source.yieldKg(htxCode, from, to),
    source.journalCounts(htxCode, from, to),
    source.parcelCounts(htxCode, from, to),
    source.shopRevenue(htxCode, from, to),
  ])
  return {
    yield_kg: yieldKg === null ? null : round1(yieldKg),
    journal_on_time_rate: journals.total > 0 ? round1((journals.onTime / journals.total) * 100) : null,
    diseased_parcel_rate: parcels.parcels > 0 ? round1((parcels.diseased / parcels.parcels) * 100) : null,
    shop_revenue_vnd: shop,
  }
}
