// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { ForecastView } from './types'

/**
 * The 14-day forecast of the cooperative, for the processing pages.
 * TODO(integration): ForecastUseCase (phase 4 A3): return new ForecastUseCase(new PrismaForecastSource()).read(htxProfileId, today).
 * Until it lands there is no forecast, so the block shows "Chưa tải được dự báo" instead of a made-up number.
 */
export async function loadForecast(_htxProfileId: string, _today: string): Promise<ForecastView | null> {
  return null
}
