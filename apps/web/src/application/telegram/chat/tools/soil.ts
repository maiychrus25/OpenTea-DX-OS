// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { ChatTool } from '../types'
import { reply } from './common'
import { findParcelByCode, notFoundReply, textArg } from './scoped'

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast'
// The route's own thresholds: wet above 0.4 m3/m3, hot above 30 degrees.
const WET = 0.4
const HOT = 30

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length

/** The health label of the route's risk factors, for the last week's means. */
export function soilLabel(moisture: number, temperature: number): string {
  if (moisture > WET) return 'Độ ẩm đất cao, rủi ro thối rễ và nấm đất'
  if (temperature > HOT) return 'Nhiệt độ đất cao, cây dễ bị stress nhiệt'
  return 'Điều kiện ổn định'
}

/** Routes: `GET /api/farm/parcels/[id]/soil-health`; the same Open-Meteo readings, without the 30-day chart. */
export const soilTool: ChatTool = {
  name: 'soil',
  titleVi: 'Sức khỏe đất',
  roles: ['farmer', 'officer', 'manager'],
  routes: ['GET /api/farm/parcels/[id]/soil-health'],
  args: [{ name: 'parcel_code', type: 'string', descriptionVi: 'Mã thửa' }],
  async run(user, args, now) {
    const code = textArg(args, 'parcel_code')
    if (!code) return reply('Sức khỏe đất', ['Nhắn "đất thửa <mã thửa>".'])
    const parcel = await findParcelByCode(user, code)
    if (!parcel) return notFoundReply('Sức khỏe đất', 'thửa')
    if (parcel.centroid_lat === null || parcel.centroid_lng === null) return reply('Sức khỏe đất', [`Thửa ${parcel.parcel_code} chưa có toạ độ.`])

    const url = new URL(OPEN_METEO)
    url.searchParams.set('latitude', String(parcel.centroid_lat))
    url.searchParams.set('longitude', String(parcel.centroid_lng))
    url.searchParams.set('hourly', 'soil_moisture_0_to_7cm,soil_temperature_0cm')
    url.searchParams.set('past_days', '7')
    url.searchParams.set('forecast_days', '1')
    url.searchParams.set('timezone', 'Asia/Ho_Chi_Minh')
    let data: { hourly?: { time?: string[]; soil_moisture_0_to_7cm?: (number | null)[]; soil_temperature_0cm?: (number | null)[] } }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (!response.ok) throw new Error(String(response.status))
      data = await response.json()
    } catch {
      return reply('Sức khỏe đất', ['Chưa lấy được số liệu đất lúc này.'])
    }

    // Hours still to come are forecasts, not readings.
    const times = data.hourly?.time ?? []
    const upTo = times.filter((time) => Date.parse(`${time}+07:00`) <= now.getTime()).length
    const series = (values: (number | null)[] = []) => values.slice(0, upTo).filter((value): value is number => value !== null)
    const moisture = series(data.hourly?.soil_moisture_0_to_7cm)
    const temperature = series(data.hourly?.soil_temperature_0cm)
    if (!moisture.length || !temperature.length) return reply('Sức khỏe đất', [`Chưa có số liệu đất cho thửa ${parcel.parcel_code}.`])

    return reply('Sức khỏe đất (Open-Meteo)', [
      `Thửa ${parcel.parcel_code} · ${parcel.crop_type}`,
      `Độ ẩm đất: ${moisture[moisture.length - 1].toFixed(2)} m³/m³`,
      `Nhiệt độ đất: ${temperature[temperature.length - 1].toFixed(1)}°C`,
      `Đánh giá 7 ngày: ${soilLabel(mean(moisture), mean(temperature))}`,
    ])
  },
}
