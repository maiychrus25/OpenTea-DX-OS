// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { GetWeatherForecastUseCase } from '@/application/weather/get-weather-forecast-usecase'
import type { WeatherZoneEntity } from '@/domain/ports/weather-port'
import { PrismaWeatherRepository } from '@/infrastructure/db/weather/prisma-weather-repository'
import type { ChatTool } from '../types'
import { reply } from './common'

export function zoneLine(zone: WeatherZoneEntity): string {
  return `${zone.parcel_name} (${zone.crop_type}): ${Math.round(zone.current.temperature)}°C, ${zone.current.condition}`
}

/** Routes: `GET /api/weather/forecast` answers the cooperative's zones; `GET /api/weather` needs a parcel (see `nearby`). */
export const weatherTool: ChatTool = {
  name: 'weather',
  titleVi: 'Thời tiết',
  roles: ['farmer', 'officer', 'manager'],
  routes: ['GET /api/weather', 'GET /api/weather/forecast'],
  args: [],
  async run(user) {
    const zones = await new GetWeatherForecastUseCase(new PrismaWeatherRepository()).execute(user.tenant.htxProfileId)
    return reply('Thời tiết', zones.map(zoneLine))
  },
}
