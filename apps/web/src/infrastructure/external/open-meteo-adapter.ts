// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

/**
 * Open-Meteo API Adapter (Infrastructure Layer)
 * Free, open-source weather API — no API key required
 * https://open-meteo.com/
 */

export interface OpenMeteoForecastDay {
  date: string
  temperature_max: number
  temperature_min: number
  precipitation_mm: number
  weathercode: number
}

export interface OpenMeteoCurrentWeather {
  temperature: number
  windspeed: number
  weathercode: number
}

export interface OpenMeteoForecastResult {
  latitude: number
  longitude: number
  current: OpenMeteoCurrentWeather
  daily: OpenMeteoForecastDay[]
}

const WEATHER_CODE_MAP: Record<number, string> = {
  0: 'Trời quang',
  1: 'Ít mây', 2: 'Mây rải rác', 3: 'U ám',
  45: 'Sương mù', 48: 'Sương muối',
  51: 'Mưa phùn nhẹ', 53: 'Mưa phùn', 55: 'Mưa phùn dày',
  61: 'Mưa nhỏ', 63: 'Mưa vừa', 65: 'Mưa to',
  71: 'Tuyết nhẹ', 73: 'Tuyết vừa', 75: 'Tuyết dày',
  80: 'Mưa rào nhẹ', 81: 'Mưa rào', 82: 'Mưa rào lớn',
  95: 'Giông', 96: 'Giông kèm mưa đá', 99: 'Giông mưa đá lớn',
}

export function weatherCodeToCondition(code: number): string {
  return WEATHER_CODE_MAP[code] || 'Không xác định'
}

export function weatherCodeToIcon(code: number): string {
  if (code === 0) return '☀️'
  if (code <= 3) return '⛅'
  if (code <= 48) return '🌫️'
  if (code <= 55) return '🌦️'
  if (code <= 65) return '🌧️'
  if (code <= 75) return '❄️'
  if (code <= 82) return '🌧️'
  return '⛈️'
}

export async function fetchOpenMeteoForecast(
  lat: number,
  lng: number,
  days: number = 7
): Promise<OpenMeteoForecastResult> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', lat.toString())
  url.searchParams.set('longitude', lng.toString())
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode')
  url.searchParams.set('current_weather', 'true')
  url.searchParams.set('timezone', 'Asia/Ho_Chi_Minh')
  url.searchParams.set('forecast_days', days.toString())

  const response = await fetch(url.toString(), {
    next: { revalidate: 3600 }, // Cache for 1 hour
  })

  if (!response.ok) {
    throw new Error(`Open-Meteo API error: ${response.status}`)
  }

  const data = await response.json()

  const daily: OpenMeteoForecastDay[] = data.daily.time.map((date: string, i: number) => ({
    date,
    temperature_max: data.daily.temperature_2m_max[i],
    temperature_min: data.daily.temperature_2m_min[i],
    precipitation_mm: data.daily.precipitation_sum[i],
    weathercode: data.daily.weathercode[i],
  }))

  return {
    latitude: data.latitude,
    longitude: data.longitude,
    current: {
      temperature: data.current_weather.temperature,
      windspeed: data.current_weather.windspeed,
      weathercode: data.current_weather.weathercode,
    },
    daily,
  }
}
