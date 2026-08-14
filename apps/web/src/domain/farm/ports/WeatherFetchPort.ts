// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { WeatherData } from '../models/WeatherData';

export interface WeatherFetchPort {
  fetchHistorical(lat: number, lon: number, date: Date): Promise<WeatherData>;
}
