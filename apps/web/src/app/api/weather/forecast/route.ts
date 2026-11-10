// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { GetWeatherForecastUseCase } from '@/application/weather/get-weather-forecast-usecase'
import { PrismaWeatherRepository } from '@/infrastructure/db/weather/prisma-weather-repository'

export const dynamic = 'force-dynamic'

async function getWeatherForecast(_req: Request) {
  const { htxProfileId } = await requireTenant()

  const weatherRepo = new PrismaWeatherRepository()
  const useCase = new GetWeatherForecastUseCase(weatherRepo)
  
  const results = await useCase.execute(htxProfileId)

  return NextResponse.json({ data: results })
}

export const GET = withErrorHandler(getWeatherForecast)
