// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** Phase 4 GĐ4-A forecast view (contract of ForecastUseCase). Days are Vietnam days; kg have one decimal. */
export interface ForecastWeek {
  /** Monday of the week, YYYY-MM-DD. */
  week_start: string
  fresh_kg: number
  dry_kg: number
}

export interface ForecastParcel {
  parcel_id: string
  parcel_code: string
  harvest_on: string
  fresh_kg: number
  dry_kg: number
  /** HISTORY: the median of the last three closed flushes. NORM: the area norm, an estimate. */
  source: 'HISTORY' | 'NORM'
}

export interface ForecastView {
  weeks: ForecastWeek[]
  parcels: ForecastParcel[]
  total_fresh_kg: number
  total_dry_kg: number
}
