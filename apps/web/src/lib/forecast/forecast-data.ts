// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { ForecastView } from './types'
import { ForecastUseCase } from '@/application/forecast/ForecastUseCase'
import { PrismaForecastSource } from '@/infrastructure/db/forecast/PrismaForecastSource'
import { logger } from '@/lib/logger'

/** The 14-day forecast of the cooperative, for the processing pages; null (the block says so) when it cannot be read. */
export async function loadForecast(htxProfileId: string, today: string): Promise<ForecastView | null> {
  try {
    return await new ForecastUseCase(new PrismaForecastSource()).read(htxProfileId, today)
  } catch (err) {
    logger.error('Forecast read failed', { err })
    return null
  }
}
