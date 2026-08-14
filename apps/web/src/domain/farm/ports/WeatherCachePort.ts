// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { WeatherData } from '../models/WeatherData';

export interface WeatherCachePort {
  findNearest(parcelId: string, date: Date): Promise<WeatherData | null>;
  save(parcelId: string, date: Date, data: WeatherData): Promise<void>;
}
