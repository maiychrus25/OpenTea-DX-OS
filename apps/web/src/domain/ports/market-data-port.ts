// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export interface MarketDataEntity {
  id: string
  source: string
  commodity: string
  metric: string
  value: number
  unit: string
  period: string
  fetched_at: Date
}

export interface FxRateEntity {
  id: string
  rates: any
  fetched_at: Date
}

export interface MarketDataPort {
  getRecentMarketData(timeWindow: Date, limit?: number): Promise<MarketDataEntity[]>
  getLatestFxRate(): Promise<FxRateEntity | null>
}
