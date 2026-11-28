// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { ForecastParcel, ForecastView } from './views'
import type { ForecastWindowRow } from './ports/ForecastSource'

/** Fresh leaf to dry tea: the middle of the 4.50 to 5.00 band. */
export const FRESH_PER_DRY = 4.75
/** Thai Nguyen norm; a cooperative may set its own. */
export const DEFAULT_FRESH_NORM_KG_PER_HA_FLUSH = 1800
export const FORECAST_DAYS = 14
const HISTORY_FLUSHES = 3

const round1 = (n: number) => Math.round(n * 10) / 10

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** The Monday on or before a YYYY-MM-DD day. */
function mondayOf(day: string): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  return date.toISOString().slice(0, 10)
}

function forecastParcel(row: ForecastWindowRow, norm: number): ForecastParcel {
  const history = row.history.slice(0, HISTORY_FLUSHES)
  const fresh = history.length > 0 ? median(history) : row.area_ha * norm
  const fresh_kg = round1(fresh)
  return { parcel_id: row.parcel_id, parcel_code: row.parcel_code, harvest_on: row.harvest_on, fresh_kg, dry_kg: round1(fresh_kg / FRESH_PER_DRY), source: history.length > 0 ? 'HISTORY' : 'NORM' }
}

/** Totals add up the rounded rows, so what the workshop sees always sums. */
export function buildForecast(rows: ForecastWindowRow[], norm: number): ForecastView {
  const parcels = rows.map((r) => forecastParcel(r, norm)).sort((a, b) => a.harvest_on.localeCompare(b.harvest_on) || a.parcel_code.localeCompare(b.parcel_code))
  const byWeek = new Map<string, { fresh_kg: number; dry_kg: number }>()
  for (const p of parcels) {
    const week = byWeek.get(mondayOf(p.harvest_on)) ?? { fresh_kg: 0, dry_kg: 0 }
    byWeek.set(mondayOf(p.harvest_on), { fresh_kg: round1(week.fresh_kg + p.fresh_kg), dry_kg: round1(week.dry_kg + p.dry_kg) })
  }
  return {
    weeks: Array.from(byWeek, ([week_start, w]) => ({ week_start, ...w })),
    parcels,
    total_fresh_kg: round1(parcels.reduce((s, p) => s + p.fresh_kg, 0)),
    total_dry_kg: round1(parcels.reduce((s, p) => s + p.dry_kg, 0)),
  }
}
