// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { prisma } from '@/infrastructure/db/prisma.client'
import { WeatherPort, WeatherZoneEntity } from '@/domain/ports/weather-port'
import { weatherCodeToCondition, weatherCodeToIcon } from '@/infrastructure/external/open-meteo-adapter'

export class PrismaWeatherRepository implements WeatherPort {
  async getWeatherForParcels(): Promise<WeatherZoneEntity[]> {
    // Get all parcels with coordinates
    const parcels = await prisma.parcel.findMany({
      where: {
        centroid_lat: { not: null },
        centroid_lng: { not: null },
      },
      select: {
        id: true,
        parcel_code: true,
        crop_type: true,
        centroid_lat: true,
        centroid_lng: true,
        household: {
          select: {
            name: true,
          },
        },
      },
      take: 10,
    })

    if (parcels.length === 0) {
      return []
    }

    const results: WeatherZoneEntity[] = []

    for (const p of parcels) {
      // Find latest weather_cache for this parcel
      const latestWeather = await prisma.weatherCache.findFirst({
        where: { parcel_id: p.id },
        orderBy: { recorded_at: 'desc' },
      })

      if (!latestWeather) continue

      // Handle both raw codes (from n8n) and translated text (from old Next.js route)
      let conditionText = latestWeather.condition
      let iconText = '☁️'
      const code = parseInt(latestWeather.condition, 10)
      if (!isNaN(code)) {
        conditionText = weatherCodeToCondition(code)
        iconText = weatherCodeToIcon(code)
      } else {
        // Fallback for old data
        if (conditionText.includes('quang')) iconText = '☀️'
        else if (conditionText.includes('mưa')) iconText = '🌧️'
      }

      // Parse forecast JSON
      let forecast_7d = []
      if (latestWeather.forecast_json && typeof latestWeather.forecast_json === 'object') {
        const data = latestWeather.forecast_json as any
        if (data.time && Array.isArray(data.time)) {
          forecast_7d = data.time.map((timeStr: string, i: number) => ({
            date: timeStr,
            temp_max: data.temperature_2m_max?.[i] ?? 0,
            temp_min: data.temperature_2m_min?.[i] ?? 0,
            precipitation_mm: data.precipitation_sum?.[i] ?? 0,
            condition: weatherCodeToCondition(data.weather_code?.[i] ?? -1),
            icon: weatherCodeToIcon(data.weather_code?.[i] ?? -1),
          }))
        }
      }

      results.push({
        parcel_code: p.parcel_code,
        parcel_name: p.household?.name ? `${p.household.name} — ${p.parcel_code}` : p.parcel_code,
        crop_type: p.crop_type,
        lat: p.centroid_lat!,
        lng: p.centroid_lng!,
        current: {
          temperature: latestWeather.temperature_c,
          windspeed: 0, // Not saved in DB currently
          condition: conditionText,
          icon: iconText,
        },
        forecast_7d,
      })
    }

    return results
  }
}
