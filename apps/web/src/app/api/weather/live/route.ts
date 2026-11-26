// SPDX-License-Identifier: MIT
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { prisma } from '@/infrastructure/db/prisma.client'
import { fetchWeatherDetail } from '@/infrastructure/external/open-meteo-detail'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const MAX_PLACES = 4

/** Live weather where the cooperative's parcels are. Parcels about 5 km apart share one place. */
async function getLiveWeather(_req: Request) {
  const { htxProfileId } = await requireTenant()

  const parcels = await prisma.parcel.findMany({
    where: { household: { htx_profile_id: htxProfileId }, centroid_lat: { not: null }, centroid_lng: { not: null } },
    select: { parcel_code: true, centroid_lat: true, centroid_lng: true },
    orderBy: { parcel_code: 'asc' },
  })

  const profile = await prisma.htxProfile.findUnique({ where: { id: htxProfileId }, select: { address: true } })

  const places = new Map<string, { lat: number; lng: number; parcels: string[] }>()
  for (const parcel of parcels) {
    const lat = parcel.centroid_lat!
    const lng = parcel.centroid_lng!
    const key = `${Math.round(lat * 20)}:${Math.round(lng * 20)}`
    const place = places.get(key) ?? { lat, lng, parcels: [] }
    place.parcels.push(parcel.parcel_code)
    places.set(key, place)
  }

  const largest = Array.from(places.values())
    .sort((a, b) => b.parcels.length - a.parcels.length)
    .slice(0, MAX_PLACES)

  try {
    const data = await Promise.all(
      largest.map(async (place) => ({ parcels: place.parcels, weather: await fetchWeatherDetail(place.lat, place.lng) }))
    )
    return NextResponse.json({ data, area: profile?.address ?? '' })
  } catch (err) {
    logger.error('Open-Meteo request failed', { err })
    return NextResponse.json(
      { error: { code: 'WEATHER_UNAVAILABLE', message: 'Không lấy được dữ liệu thời tiết' } },
      { status: 502 }
    )
  }
}

export const GET = withErrorHandler(getLiveWeather)
