// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** The 14-day fresh and dry tea forecast for the workshop (phase 4 spec §3.3). Kg are rounded to one decimal. */
export interface ForecastView {
  /** Monday-start weeks that hold at least one parcel, oldest first. */
  weeks: { week_start: string; fresh_kg: number; dry_kg: number }[]
  /** Ordered by harvest day, then parcel code. */
  parcels: ForecastParcel[]
  total_fresh_kg: number
  total_dry_kg: number
}

export interface ForecastParcel {
  parcel_id: string
  parcel_code: string
  /** Vietnam day of the estimated harvest, YYYY-MM-DD. */
  harvest_on: string
  fresh_kg: number
  dry_kg: number
  /** HISTORY = median of closed flushes; NORM = area times the per-hectare norm. */
  source: 'HISTORY' | 'NORM'
}
