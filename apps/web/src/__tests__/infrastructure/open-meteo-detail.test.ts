// SPDX-License-Identifier: MIT
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { toWeatherDetail } from '@/infrastructure/external/open-meteo-detail'

const hours = Array.from({ length: 48 }, (_, i) => `2026-11-${i < 24 ? '26' : '27'}T${String(i % 24).padStart(2, '0')}:00`)

const response = {
  current: { time: '2026-11-26T10:15', temperature_2m: 19.4, apparent_temperature: 20, relative_humidity_2m: 88, weather_code: 61, is_day: 1, wind_speed_10m: 7, wind_gusts_10m: 15, wind_direction_10m: 90, surface_pressure: 1010, precipitation: 0.4, visibility: 8500 },
  hourly: { time: hours, temperature_2m: hours.map((_, i) => i), precipitation_probability: hours.map(() => 30), weather_code: hours.map(() => 3), is_day: hours.map(() => 1) },
  daily: { time: ['2026-11-26'], weather_code: [61], temperature_2m_min: [17], temperature_2m_max: [23], precipitation_probability_max: [70], precipitation_sum: [4.2], uv_index_max: [5], sunrise: ['2026-11-26T06:10'], sunset: ['2026-11-26T17:15'] },
}

describe('toWeatherDetail', () => {
  it('starts the hourly forecast at the current hour and keeps 24 hours', () => {
    const detail = toWeatherDetail(response)

    expect(detail.hourly).toHaveLength(24)
    expect(detail.hourly[0]).toMatchObject({ time: '2026-11-26T10:00', temperature: 10, rainChance: 30, isDay: true })
  })

  it('maps current conditions and daily range', () => {
    const detail = toWeatherDetail(response)

    expect(detail.current).toMatchObject({ temperature: 19.4, feelsLike: 20, humidity: 88, visibilityKm: 8.5 })
    expect(detail.daily[0]).toEqual({ date: '2026-11-26', code: 61, min: 17, max: 23, rainChance: 70, rainMm: 4.2 })
  })
})
