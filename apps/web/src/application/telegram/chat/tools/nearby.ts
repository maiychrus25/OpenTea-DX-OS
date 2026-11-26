// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { GetWeatherUseCase } from '@/application/farm/GetWeatherUseCase'
import type { ParcelSummary } from '@/domain/farm/ports/ParcelPort'
import { PrismaWeatherCacheRepository } from '@/infrastructure/db/farm/PrismaWeatherCacheRepository'
import { GatewayParcelReader } from '@/infrastructure/core/gateway-parcel-reader'
import type { ChatTool, ChatUser } from '../types'
import { coreClient, reply, todayIso, visibleParcels } from './common'

// Same wording as the copy key `locationNoParcel` (contract C10).
const LOCATION_NO_PARCEL = 'Không tìm thấy thửa nào có toạ độ.'

/** Great-circle distance in km. */
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(a))
}

/** Routes: `GET /api/farm/parcels` and `GET /api/weather`, for the parcel nearest to a shared location. */
export const nearbyTool: ChatTool = {
  name: 'nearby',
  titleVi: 'Thửa gần đây',
  roles: ['farmer', 'officer', 'manager'],
  routes: ['GET /api/farm/parcels', 'GET /api/weather'],
  args: [
    { name: 'latitude', type: 'number', descriptionVi: 'Vĩ độ của vị trí' },
    { name: 'longitude', type: 'number', descriptionVi: 'Kinh độ của vị trí' },
  ],
  async run(user: ChatUser, args, now) {
    const lat = Number(args.latitude)
    const lng = Number(args.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return reply('Vùng trồng', [])

    const located = (await visibleParcels(user)).filter(
      (parcel): parcel is ParcelSummary & { centroid_lat: number; centroid_lng: number } =>
        parcel.centroid_lat !== null && parcel.centroid_lng !== null
    )
    if (!located.length) return reply('Vùng trồng', [LOCATION_NO_PARCEL])

    const nearest = located.reduce((best, parcel) =>
      distanceKm(lat, lng, parcel.centroid_lat, parcel.centroid_lng) < distanceKm(lat, lng, best.centroid_lat, best.centroid_lng) ? parcel : best
    )
    const km = distanceKm(lat, lng, nearest.centroid_lat, nearest.centroid_lng)
    const weather = await new GetWeatherUseCase(new PrismaWeatherCacheRepository(), new GatewayParcelReader(coreClient(user))).execute(
      nearest.id,
      todayIso(now),
      { id: user.tenant.userId, role: user.tenant.role, householdId: user.householdId ?? undefined }
    )
    return reply('Vùng trồng', [
      `${nearest.parcel_code}, cách ${km.toFixed(1)} km`,
      ...(weather ? [`Thời tiết: ${weather.condition}, ${weather.temperature_c}°C, mưa ${weather.precipitation_mm} mm`] : []),
    ])
  },
}
