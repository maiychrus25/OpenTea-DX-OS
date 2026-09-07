// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { prisma } from '@/infrastructure/db/prisma.client'
import { MarketDataPort, MarketDataEntity, FxRateEntity } from '@/domain/ports/market-data-port'

export class PrismaMarketDataRepository implements MarketDataPort {
  async getRecentMarketData(timeWindow: Date, limit: number = 50): Promise<MarketDataEntity[]> {
    const data = await prisma.marketData.findMany({
      where: { fetched_at: { gte: timeWindow } },
      orderBy: { fetched_at: 'desc' },
      take: limit,
    })
    
    return data.map(d => ({
      id: d.id,
      source: d.source,
      commodity: d.commodity,
      metric: d.metric,
      value: d.value,
      unit: d.unit,
      period: d.period,
      fetched_at: d.fetched_at,
    }))
  }

  async getLatestFxRate(): Promise<FxRateEntity | null> {
    const fx = await prisma.fxRate.findFirst({
      orderBy: { fetched_at: 'desc' },
    })
    
    if (!fx) return null
    
    return {
      id: fx.id,
      base_currency: fx.base_currency,
      rates: fx.rates,
      fetched_at: fx.fetched_at,
    }
  }
}
