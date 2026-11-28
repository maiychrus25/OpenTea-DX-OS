// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** An open flush due in the window; `history` is the net kg of the parcel's closed flushes, newest first. */
export interface ForecastWindowRow {
  parcel_id: string
  parcel_code: string
  harvest_on: string
  area_ha: number
  history: number[]
}

/** Raw figures of the forecast. Every method is one HTX only. */
export interface ForecastSource {
  /** The cooperative's own fresh kg per hectare per flush, or null when it set none. */
  freshNorm(htxProfileId: string): Promise<number | null>
  /** Open flushes (not harvested) with a Vietnam harvest day in [from, to]. */
  windowParcels(htxProfileId: string, from: string, to: string): Promise<ForecastWindowRow[]>
}
