// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { WeatherCachePort } from '@/domain/farm/ports/WeatherCachePort';
import { WeatherData } from '@/domain/farm/models/WeatherData';
import { prisma } from '@/infrastructure/db/prisma.client';

export class PrismaWeatherCacheRepository implements WeatherCachePort {
  async findNearest(parcelId: string, date: Date): Promise<WeatherData | null> {
    const record = await prisma.weatherCache.findFirst({
      where: {
        parcel_id: parcelId,
        recorded_at: {
          // Looking for exactly the noon of the date
          equals: date,
        },
      },
    });

    if (!record) return null;

    return {
      condition: record.condition,
      temperature_c: record.temperature_c,
      precipitation_mm: record.precipitation_mm,
      humidity_pct: record.humidity_pct,
    };
  }

  async save(parcelId: string, date: Date, data: WeatherData): Promise<void> {
    await prisma.weatherCache.create({
      data: {
        parcel_id: parcelId,
        recorded_at: date,
        condition: data.condition,
        temperature_c: data.temperature_c,
        precipitation_mm: data.precipitation_mm,
        humidity_pct: data.humidity_pct,
        source: 'open-meteo',
      },
    });
  }
}
