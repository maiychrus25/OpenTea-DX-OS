// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export interface WeatherZoneEntity {
  parcel_code: string
  parcel_name: string
  crop_type: string
  lat: number
  lng: number
  current: {
    temperature: number
    windspeed: number
    condition: string
    icon: string
  }
  forecast_7d: Array<{
    date: string
    temp_max: number
    temp_min: number
    precipitation_mm: number
    condition: string
    icon: string
  }>
}

export interface WeatherPort {
  /**
   * Retrieves the latest weather cache and 7-day forecast for 10 representative parcels
   */
  getWeatherForParcels(htxProfileId: string): Promise<WeatherZoneEntity[]>
}
