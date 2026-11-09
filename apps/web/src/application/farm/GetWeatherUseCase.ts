// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { WeatherCachePort } from '@/domain/farm/ports/WeatherCachePort';
import { ParcelPort } from '@/domain/farm/ports/ParcelPort';
import { WeatherData } from '@/domain/farm/models/WeatherData';
import { DomainError, ValidationError, ForbiddenError } from '@/domain/errors';

export class GetWeatherUseCase {
  constructor(
    private readonly weatherCachePort: WeatherCachePort,
    private readonly parcelPort: Pick<ParcelPort, 'findById'>
  ) {}

  async execute(parcelId: string, dateStr: string, userContext?: { id: string, role: string, householdId?: string }): Promise<WeatherData | null> {
    const parcel = await this.parcelPort.findById(parcelId);
    if (!parcel) {
      throw new DomainError('Parcel not found');
    }

    if (userContext && userContext.role === 'farmer') {
      if (parcel.household_id !== userContext.householdId) {
        throw new ForbiddenError('Forbidden: You do not have access to this parcel');
      }
    }

    if (parcel.centroid_lat === null || parcel.centroid_lng === null) {
      throw new ValidationError('Parcel has no centroid coordinates');
    }

    // Parse the date (assuming format YYYY-MM-DD from Zod)
    const date = new Date(`${dateStr}T12:00:00Z`);

    // Check cache
    const cached = await this.weatherCachePort.findNearest(parcelId, date);
    if (cached) {
      return cached;
    }

    return null;
  }
}
