// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { CreateLotUseCase } from '@/application/lot/CreateLotUseCase'
import { LotPort } from '@/domain/lot/ports/LotPort'
import { ParcelPort, ParcelSummary } from '@/domain/farm/ports/ParcelPort'
import { JournalPort } from '@/domain/journal/ports/JournalPort'
import { DomainError } from '@/domain/errors/DomainError'

describe('CreateLotUseCase', () => {
  let lotPort: jest.Mocked<LotPort>
  let parcelPort: jest.Mocked<ParcelPort>
  let journalPort: jest.Mocked<JournalPort>
  let useCase: CreateLotUseCase

  beforeEach(() => {
    lotPort = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      exportQr: jest.fn(),
    }
    parcelPort = {
      findById: jest.fn(),
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      approveHarvest: jest.fn(),
    }
    journalPort = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      batchApprove: jest.fn(),
    }
    useCase = new CreateLotUseCase(lotPort, parcelPort, journalPort)
  })

  it('throws if no parcel provided', async () => {
    await expect(useCase.execute({
      commodity: 'Rice',
      harvest_date: new Date(),
      parcel_ids: [],
      htx_profile_id: 'htx1',
      created_by_id: 'user1'
    })).rejects.toThrow(DomainError)
  })

  it('throws if parcel not found', async () => {
    parcelPort.findById.mockResolvedValue(null)
    await expect(useCase.execute({
      commodity: 'Rice',
      harvest_date: new Date(),
      parcel_ids: ['p1'],
      htx_profile_id: 'htx1',
      created_by_id: 'user1'
    })).rejects.toThrow(/Không tìm thấy thửa đất/)
  })

  it('throws if parcel status is invalid', async () => {
    parcelPort.findById.mockResolvedValue({ status: 'PLANTING', parcel_code: 'P01' } as Partial<ParcelSummary> as any)
    await expect(useCase.execute({
      commodity: 'Rice',
      harvest_date: new Date(),
      parcel_ids: ['p1'],
      htx_profile_id: 'htx1',
      created_by_id: 'user1'
    })).rejects.toThrow(/không ở trạng thái hợp lệ/)
  })

  it('throws if withdrawal period not passed', async () => {
    parcelPort.findById.mockResolvedValue({ status: 'HARVESTED', parcel_code: 'P01' } as Partial<ParcelSummary> as any)
    
    // safe harvest date is 2026-08-30
    journalPort.findAll.mockResolvedValue({
      entries: [
        {
          status: 'APPROVED',
          activities: [{ safe_harvest_date: new Date('2026-08-30') }]
        } as any
      ],
      total: 1
    })

    await expect(useCase.execute({
      commodity: 'Rice',
      harvest_date: new Date('2026-08-25'), // harvest before safe date
      parcel_ids: ['p1'],
      htx_profile_id: 'htx1',
      created_by_id: 'user1'
    })).rejects.toThrow(/WITHDRAWAL_NOT_PASSED/)
  })

  it('creates lot if all valid', async () => {
    parcelPort.findById.mockResolvedValue({ status: 'HARVEST_APPROVED', parcel_code: 'P01' } as Partial<ParcelSummary> as any)
    
    // safe harvest date is 2026-08-20
    journalPort.findAll.mockResolvedValue({
      entries: [
        {
          status: 'APPROVED',
          activities: [{ safe_harvest_date: new Date('2026-08-20') }]
        } as any
      ],
      total: 1
    })

    const payload = {
      commodity: 'Rice',
      harvest_date: new Date('2026-08-25'),
      parcel_ids: ['p1'],
      certificate_keys: ['cert/123.pdf'],
      htx_profile_id: 'htx1',
      created_by_id: 'user1'
    }

    lotPort.create.mockResolvedValue({ id: 'lot1' } as any)

    const res = await useCase.execute(payload)
    expect(res).toEqual({ id: 'lot1' })
    expect(lotPort.create).toHaveBeenCalledWith(payload)
  })
})
