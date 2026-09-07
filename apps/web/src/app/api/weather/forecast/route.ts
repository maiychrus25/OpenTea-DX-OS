// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/infrastructure/db/prisma.client'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import {
  fetchOpenMeteoForecast,
  weatherCodeToCondition,
  weatherCodeToIcon,
} from '@/infrastructure/external/open-meteo-adapter'

export const dynamic = 'force-dynamic'

async function getWeatherForecast(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }

  const url = new URL(req.url)
  const days = parseInt(url.searchParams.get('days') || '7', 10)

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
    take: 10, // Limit to prevent excessive API calls
  })

  if (parcels.length === 0) {
    // No parcels with coordinates — use default HTX location (Mekong Delta)
    const defaultLat = 9.7833
    const defaultLng = 105.4667

    try {
      const forecast = await fetchOpenMeteoForecast(defaultLat, defaultLng, days)
      return NextResponse.json({
        data: [{
          parcel_code: 'HTX-DEFAULT',
          parcel_name: 'Vùng trồng HTX (Mặc định)',
          crop_type: 'Lúa',
          lat: defaultLat,
          lng: defaultLng,
          current: {
            temperature: forecast.current.temperature,
            windspeed: forecast.current.windspeed,
            condition: weatherCodeToCondition(forecast.current.weathercode),
            icon: weatherCodeToIcon(forecast.current.weathercode),
          },
          forecast_7d: forecast.daily.map(d => ({
            date: d.date,
            temp_max: d.temperature_max,
            temp_min: d.temperature_min,
            precipitation_mm: d.precipitation_mm,
            condition: weatherCodeToCondition(d.weathercode),
            icon: weatherCodeToIcon(d.weathercode),
          })),
        }],
      })
    } catch {
      return NextResponse.json({ data: [] })
    }
  }

  // Group parcels by unique lat/lng (rounded to 2 decimals to avoid duplicate API calls)
  const uniqueLocations = new Map<string, typeof parcels>()
  for (const p of parcels) {
    const key = `${Math.round(p.centroid_lat! * 100) / 100},${Math.round(p.centroid_lng! * 100) / 100}`
    if (!uniqueLocations.has(key)) {
      uniqueLocations.set(key, [])
    }
    uniqueLocations.get(key)!.push(p)
  }

  const results = []

  for (const [, locationParcels] of Array.from(uniqueLocations)) {
    const representative = locationParcels[0]
    try {
      const forecast = await fetchOpenMeteoForecast(
        representative.centroid_lat!,
        representative.centroid_lng!,
        days
      )

      // Cache weather data into weather_cache table
      const now = new Date()
      now.setMinutes(0, 0, 0) // hour-truncated
      for (const p of locationParcels) {
        try {
          await prisma.weatherCache.upsert({
            where: {
              parcel_id_recorded_at: {
                parcel_id: p.id,
                recorded_at: now,
              },
            },
            update: {
              condition: weatherCodeToCondition(forecast.current.weathercode),
              temperature_c: forecast.current.temperature,
              precipitation_mm: forecast.daily[0]?.precipitation_mm ?? 0,
              humidity_pct: 0, // Open-Meteo free tier doesn't include humidity in daily
            },
            create: {
              parcel_id: p.id,
              recorded_at: now,
              condition: weatherCodeToCondition(forecast.current.weathercode),
              temperature_c: forecast.current.temperature,
              precipitation_mm: forecast.daily[0]?.precipitation_mm ?? 0,
              humidity_pct: 0,
              source: 'open-meteo',
            },
          })
        } catch {
          // Non-critical: cache write failure
        }
      }

      // Map to response for each parcel at this location
      for (const p of locationParcels) {
        results.push({
          parcel_code: p.parcel_code,
          parcel_name: p.household?.name
            ? `${p.household.name} — ${p.parcel_code}`
            : p.parcel_code,
          crop_type: p.crop_type,
          lat: p.centroid_lat,
          lng: p.centroid_lng,
          current: {
            temperature: forecast.current.temperature,
            windspeed: forecast.current.windspeed,
            condition: weatherCodeToCondition(forecast.current.weathercode),
            icon: weatherCodeToIcon(forecast.current.weathercode),
          },
          forecast_7d: forecast.daily.map(d => ({
            date: d.date,
            temp_max: d.temperature_max,
            temp_min: d.temperature_min,
            precipitation_mm: d.precipitation_mm,
            condition: weatherCodeToCondition(d.weathercode),
            icon: weatherCodeToIcon(d.weathercode),
          })),
        })
      }
    } catch {
      // Skip location on API failure
    }
  }

  return NextResponse.json({ data: results })
}

export const GET = withErrorHandler(getWeatherForecast)
