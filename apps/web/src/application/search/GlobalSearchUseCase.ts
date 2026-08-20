// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { prisma } from '@/infrastructure/db/prisma.client'

export interface SearchResult {
  type: 'HOUSEHOLD' | 'PARCEL' | 'LOT'
  id: string
  title: string
  subtitle?: string
}

export class GlobalSearchUseCase {
  async execute(query: string, htxProfileId: string): Promise<SearchResult[]> {
    if (!query || query.length < 2) return []

    const results: SearchResult[] = []

    // Search Households
    const households = await prisma.household.findMany({
      where: {
        htx_profile_id: htxProfileId,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { phone: { contains: query, mode: 'insensitive' } },
        ]
      },
      take: 5
    })
    
    households.forEach(h => {
      results.push({
        type: 'HOUSEHOLD',
        id: h.id,
        title: h.name,
        subtitle: h.phone ?? undefined
      })
    })

    // Search Parcels
    const parcels = await prisma.parcel.findMany({
      where: {
        household: { htx_profile_id: htxProfileId },
        OR: [
          { parcel_code: { contains: query, mode: 'insensitive' } },
          { household: { name: { contains: query, mode: 'insensitive' } } },
        ]
      },
      take: 5,
      include: { household: true }
    })

    parcels.forEach(p => {
      results.push({
        type: 'PARCEL',
        id: p.id,
        title: p.parcel_code,
        subtitle: `Hộ: ${p.household.name}`
      })
    })

    // Search Lots
    const lots = await prisma.lot.findMany({
      where: {
        htx_profile_id: htxProfileId,
        lot_code: { contains: query, mode: 'insensitive' }
      },
      take: 5
    })

    lots.forEach(l => {
      results.push({
        type: 'LOT',
        id: l.id,
        title: l.lot_code,
        subtitle: `Status: ${l.status}`
      })
    })

    return results
  }
}
