// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { GetLotTraceDataUseCase } from '@/application/useCases/get-lot-trace-data-usecase'
import { NotFoundError } from '@/domain/errors'
import { computeSafeHarvestDate } from '@/infrastructure/db/repositories/prisma-lot-trace-repository'

describe('Story 7.9a: GetLotTraceDataUseCase', () => {

  // TC-7.9a-01: NotFoundError
  test('throws NotFoundError when lot not found', async () => {
    const mockRepo = {
      getLotByCode: jest.fn().mockResolvedValue(null),
    }
    const useCase = new GetLotTraceDataUseCase(mockRepo)
    await expect(useCase.execute('NONEXISTENT-001')).rejects.toThrow(NotFoundError)
  })

  // TC-7.9a-02: is_harvest_safe = true
  test('returns is_harvest_safe=true when latest_safe_harvest_date is past', async () => {
    const pastDate = new Date('2020-01-01')
    const mockRepo = {
      getLotByCode: jest.fn().mockResolvedValue({
        lot_code: 'SAFE-001',
        is_harvest_safe: true,
        latest_safe_harvest_date: pastDate,
      }),
    }
    const useCase = new GetLotTraceDataUseCase(mockRepo)
    const result = await useCase.execute('SAFE-001')
    expect(result.is_harvest_safe).toBe(true)
    expect(result.latest_safe_harvest_date).toEqual(pastDate)
  })

  // TC-7.9a-03: is_harvest_safe = false
  test('returns is_harvest_safe=false when latest_safe_harvest_date is future', async () => {
    const futureDate = new Date(Date.now() + 86400000 * 30) // 30 days ahead
    const mockRepo = {
      getLotByCode: jest.fn().mockResolvedValue({
        lot_code: 'UNSAFE-001',
        is_harvest_safe: false,
        latest_safe_harvest_date: futureDate,
      }),
    }
    const useCase = new GetLotTraceDataUseCase(mockRepo)
    const result = await useCase.execute('UNSAFE-001')
    expect(result.is_harvest_safe).toBe(false)
  })

  // TC-7.9a-04: is_harvest_safe = false when no withdrawal
  test('returns is_harvest_safe=false when no withdrawal activities', async () => {
    const mockRepo = {
      getLotByCode: jest.fn().mockResolvedValue({
        lot_code: 'NO-WITHDRAWAL-001',
        is_harvest_safe: false,
        latest_safe_harvest_date: null,
      }),
    }
    const useCase = new GetLotTraceDataUseCase(mockRepo)
    const result = await useCase.execute('NO-WITHDRAWAL-001')
    expect(result.is_harvest_safe).toBe(false)
    expect(result.latest_safe_harvest_date).toBeNull()
  })

  // TC-7.9a-05: MAX withdrawal logic
  test('picks MAX safe_harvest_date across all activities', () => {
    const entries = [
      { entry_date: new Date('2026-01-01'), activities: [{ withdrawal_days: 7 }] },
      { entry_date: new Date('2026-01-01'), activities: [{ withdrawal_days: 21 }] }, // MAX
      { entry_date: new Date('2026-01-01'), activities: [{ withdrawal_days: null }] },
    ]
    const result = computeSafeHarvestDate(entries)
    expect(result?.toISOString().slice(0, 10)).toBe('2026-01-22')
  })

  // TC-7.9a-06: LotTraceData shape complete
  test('LotTraceData has all required fields', async () => {
    const mockFullLotTraceData = {
      lot_code: 'FULL-001',
      commodity: 'Rice',
      quality_grade: null,
      status: 'READY',
      packaging_date: new Date(),
      total_weight_kg: 500,
      created_at: new Date(),
      is_harvest_safe: true,
      latest_safe_harvest_date: new Date(),
      parcels: [],
      journal_summaries: [],
      certificate_keys: [],
      htx_name: 'Test HTX'
    }
    const mockRepo = { getLotByCode: jest.fn().mockResolvedValue(mockFullLotTraceData) }
    const useCase = new GetLotTraceDataUseCase(mockRepo)
    const result = await useCase.execute('FULL-001')
    
    expect(result).toHaveProperty('lot_code')
    expect(result).toHaveProperty('commodity')
    expect(result).toHaveProperty('parcels')
    expect(result).toHaveProperty('journal_summaries')
    expect(result).toHaveProperty('certificate_keys')
    expect(result).toHaveProperty('is_harvest_safe')
    expect(result).toHaveProperty('latest_safe_harvest_date')
  })
})
