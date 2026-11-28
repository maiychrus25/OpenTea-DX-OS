// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { GetHtxProfileUseCase } from '@/application/useCases/GetHtxProfileUseCase'
import { NotFoundError } from '@/domain/errors'
import { localDay } from '@/domain/shared/local-day'
import { prisma } from '@/infrastructure/db/prisma.client'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'
import { loadForecast } from './forecast-data'
import type { ForecastView } from './types'

/** The forecast of the session's HTX, or null when the HTX or the forecast is not available. */
export async function forecastForHtx(htxCode: string | null | undefined): Promise<ForecastView | null> {
  if (!htxCode) return null
  try {
    const profile = await new GetHtxProfileUseCase(new PrismaHtxProfileRepository(prisma)).execute(htxCode)
    return await loadForecast(profile.id, localDay(new Date()))
  } catch (error) {
    if (error instanceof NotFoundError) return null
    throw error
  }
}
