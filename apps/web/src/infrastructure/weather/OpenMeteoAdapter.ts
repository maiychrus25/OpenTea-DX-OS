// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { WeatherFetchPort } from '@/domain/farm/ports/WeatherFetchPort';
import { WeatherData } from '@/domain/farm/models/WeatherData';
import { DomainError } from '@/domain/errors';

export class OpenMeteoAdapter implements WeatherFetchPort {
  async fetchHistorical(lat: number, lon: number, date: Date): Promise<WeatherData> {
    const dateStr = date.toISOString().split('T')[0];
    const url = new URL('https://archive-api.open-meteo.com/v1/archive');
    
    url.searchParams.append('latitude', lat.toString());
    url.searchParams.append('longitude', lon.toString());
    url.searchParams.append('start_date', dateStr);
    url.searchParams.append('end_date', dateStr);
    url.searchParams.append('hourly', 'temperature_2m,precipitation,relative_humidity_2m,weathercode');
    url.searchParams.append('timezone', 'Asia/Ho_Chi_Minh');

    try {
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`Open-Meteo API returned ${response.status}`);
      }

      const data = await response.json();
      
      // Index 12 corresponds to 12:00 noon in the hourly array
      const targetIndex = 12;

      const hourly = data.hourly;
      if (!hourly || !hourly.temperature_2m || hourly.temperature_2m.length <= targetIndex) {
        throw new Error('Invalid or incomplete data from Open-Meteo');
      }

      const temperature_c = hourly.temperature_2m[targetIndex];
      const precipitation_mm = hourly.precipitation[targetIndex];
      const humidity_pct = hourly.relative_humidity_2m[targetIndex];
      const wmoCode = hourly.weathercode[targetIndex];

      return {
        condition: this.mapWmoCodeToCondition(wmoCode),
        temperature_c,
        precipitation_mm,
        humidity_pct,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new DomainError(`Weather fetch failed: ${error.message}`);
      }
      throw new DomainError('Weather fetch failed with unknown error');
    }
  }

  private mapWmoCodeToCondition(code: number): string {
    // Basic mapping based on WMO Weather interpretation codes (WW)
    if (code === 0) return 'Quang đãng';
    if (code === 1 || code === 2 || code === 3) return 'Có mây';
    if (code === 45 || code === 48) return 'Sương mù';
    if (code >= 51 && code <= 55) return 'Mưa phùn';
    if (code >= 56 && code <= 57) return 'Mưa phùn đóng băng';
    if (code >= 61 && code <= 65) return 'Mưa';
    if (code >= 66 && code <= 67) return 'Mưa đóng băng';
    if (code >= 71 && code <= 77) return 'Tuyết rơi';
    if (code >= 80 && code <= 82) return 'Mưa rào';
    if (code >= 85 && code <= 86) return 'Mưa tuyết';
    if (code >= 95 && code <= 99) return 'Mưa dông';
    return 'Không xác định';
  }
}
