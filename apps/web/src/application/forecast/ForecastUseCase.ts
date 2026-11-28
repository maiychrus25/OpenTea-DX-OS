// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { buildForecast, DEFAULT_FRESH_NORM_KG_PER_HA_FLUSH, FORECAST_DAYS } from '@/domain/forecast/forecast'
import type { ForecastSource } from '@/domain/forecast/ports/ForecastSource'
import type { ForecastView } from '@/domain/forecast/views'

/** Deterministic 14-day forecast from weighing history and area norm; no weather, no LLM. */
export class ForecastUseCase {
  constructor(private readonly source: ForecastSource) {}

  /** `today` is a Vietnam day, YYYY-MM-DD. */
  async read(htxProfileId: string, today: string): Promise<ForecastView> {
    const end = new Date(new Date(`${today}T00:00:00Z`).getTime() + FORECAST_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const [norm, rows] = await Promise.all([this.source.freshNorm(htxProfileId), this.source.windowParcels(htxProfileId, today, end)])
    return buildForecast(rows, norm ?? DEFAULT_FRESH_NORM_KG_PER_HA_FLUSH)
  }
}
