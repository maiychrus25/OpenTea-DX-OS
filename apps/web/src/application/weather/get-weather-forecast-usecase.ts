// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { WeatherPort, WeatherZoneEntity } from '@/domain/ports/weather-port'

export class GetWeatherForecastUseCase {
  constructor(private weatherPort: WeatherPort) {}

  async execute(): Promise<WeatherZoneEntity[]> {
    return this.weatherPort.getWeatherForParcels()
  }
}
