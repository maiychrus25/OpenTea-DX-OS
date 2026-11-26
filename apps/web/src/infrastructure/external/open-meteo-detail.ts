// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

/** Current, hourly and daily conditions from Open-Meteo (https://open-meteo.com/, no API key). */

export interface WeatherHour {
  time: string
  temperature: number
  rainChance: number
  code: number
  isDay: boolean
}

export interface WeatherDay {
  date: string
  code: number
  min: number
  max: number
  rainChance: number
  rainMm: number
}

export interface WeatherDetail {
  updatedAt: string
  current: {
    temperature: number
    feelsLike: number
    humidity: number
    code: number
    isDay: boolean
    windSpeed: number
    windGust: number
    windDirection: number
    pressure: number
    rainMm: number
    visibilityKm: number | null
  }
  today: { uvMax: number | null; sunrise: string; sunset: string }
  hourly: WeatherHour[]
  daily: WeatherDay[]
}

const CURRENT = 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m,wind_gusts_10m,wind_direction_10m,surface_pressure,precipitation,visibility'
const HOURLY = 'temperature_2m,precipitation_probability,weather_code,is_day'
const DAILY = 'weather_code,temperature_2m_min,temperature_2m_max,precipitation_probability_max,precipitation_sum,uv_index_max,sunrise,sunset'
const HOURS_SHOWN = 24

export function toWeatherDetail(data: any): WeatherDetail {
  const current = data.current
  // Times are local ISO strings without a zone, so they compare as text.
  const thisHour = `${String(current.time).slice(0, 13)}:00`
  const start = Math.max(data.hourly.time.findIndex((time: string) => time >= thisHour), 0)

  return {
    updatedAt: current.time,
    current: {
      temperature: current.temperature_2m,
      feelsLike: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      code: current.weather_code,
      isDay: current.is_day === 1,
      windSpeed: current.wind_speed_10m,
      windGust: current.wind_gusts_10m,
      windDirection: current.wind_direction_10m,
      pressure: current.surface_pressure,
      rainMm: current.precipitation,
      visibilityKm: current.visibility == null ? null : current.visibility / 1000,
    },
    today: {
      uvMax: data.daily.uv_index_max?.[0] ?? null,
      sunrise: data.daily.sunrise[0],
      sunset: data.daily.sunset[0],
    },
    hourly: data.hourly.time.slice(start, start + HOURS_SHOWN).map((time: string, i: number) => ({
      time,
      temperature: data.hourly.temperature_2m[start + i],
      rainChance: data.hourly.precipitation_probability?.[start + i] ?? 0,
      code: data.hourly.weather_code[start + i],
      isDay: data.hourly.is_day[start + i] === 1,
    })),
    daily: data.daily.time.map((date: string, i: number) => ({
      date,
      code: data.daily.weather_code[i],
      min: data.daily.temperature_2m_min[i],
      max: data.daily.temperature_2m_max[i],
      rainChance: data.daily.precipitation_probability_max?.[i] ?? 0,
      rainMm: data.daily.precipitation_sum?.[i] ?? 0,
    })),
  }
}

export async function fetchWeatherDetail(lat: number, lng: number): Promise<WeatherDetail> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', lat.toFixed(3))
  url.searchParams.set('longitude', lng.toFixed(3))
  url.searchParams.set('current', CURRENT)
  url.searchParams.set('hourly', HOURLY)
  url.searchParams.set('daily', DAILY)
  url.searchParams.set('timezone', 'Asia/Ho_Chi_Minh')
  url.searchParams.set('forecast_days', '10')

  const response = await fetch(url.toString(), { next: { revalidate: 900 }, signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error(`Open-Meteo API error: ${response.status}`)
  return toWeatherDetail(await response.json())
}
