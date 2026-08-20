// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { GlobalSearchUseCase } from '../GlobalSearchUseCase'
import { prisma } from '@/infrastructure/db/prisma.client'

// Mock prisma client
jest.mock('@/infrastructure/db/prisma.client', () => ({
  prisma: {
    household: {
      findMany: jest.fn()
    },
    parcel: {
      findMany: jest.fn()
    },
    lot: {
      findMany: jest.fn()
    }
  }
}))

describe('GlobalSearchUseCase', () => {
  let useCase: GlobalSearchUseCase

  beforeEach(() => {
    useCase = new GlobalSearchUseCase()
    jest.clearAllMocks()
  })

  it('should return empty array if query length < 2', async () => {
    const results = await useCase.execute('a', 'htx-1')
    expect(results).toEqual([])
    expect(prisma.household.findMany).not.toHaveBeenCalled()
  })

  it('should aggregate results from household, parcel, and lot', async () => {
    const mockHouseholds = [
      { id: 'hh1', name: 'Household 1', phone: '123' }
    ]
    const mockParcels = [
      { id: 'p1', parcel_code: 'P-001', household: { name: 'Household 1' } }
    ]
    const mockLots = [
      { id: 'L1', lot_code: 'LOT-001', status: 'READY' }
    ]

    ;(prisma.household.findMany as jest.Mock).mockResolvedValue(mockHouseholds)
    ;(prisma.parcel.findMany as jest.Mock).mockResolvedValue(mockParcels)
    ;(prisma.lot.findMany as jest.Mock).mockResolvedValue(mockLots)

    const results = await useCase.execute('001', 'htx-1')

    expect(prisma.household.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.parcel.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.lot.findMany).toHaveBeenCalledTimes(1)

    expect(results).toHaveLength(3)
    
    // Check mapping
    expect(results).toEqual(expect.arrayContaining([
      { type: 'HOUSEHOLD', id: 'hh1', title: 'Household 1', subtitle: '123' },
      { type: 'PARCEL', id: 'p1', title: 'P-001', subtitle: 'Hộ: Household 1' },
      { type: 'LOT', id: 'L1', title: 'LOT-001', subtitle: 'Status: READY' }
    ]))
  })
})
