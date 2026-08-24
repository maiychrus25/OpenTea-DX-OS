// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { CreateJournalEntryUseCase } from '@/application/journal/CreateJournalEntryUseCase'
import { DeleteJournalEntryUseCase } from '@/application/journal/DeleteJournalEntryUseCase'
import { JournalPort } from '@/domain/journal/ports/JournalPort'
import { ParcelPort } from '@/domain/farm/ports/ParcelPort'
import { ForbiddenError } from '@/domain/errors'

const createInput = {
  parcel_id: 'parcel-1',
  entry_date: new Date('2026-08-24T00:00:00.000Z'),
  activity_type: 'SPRAYING',
  performed_by: 'Farmer A',
  submitted_by_id: 'farmer-user-1',
  submitted_role: 'FARMER' as const,
  activities: [{ activity_type: 'SPRAYING', product_name: 'Bio spray' }],
}

describe('Farmer journal production flow', () => {
  let journalPort: jest.Mocked<JournalPort>
  let parcelPort: jest.Mocked<ParcelPort>

  beforeEach(() => {
    journalPort = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'entry-1' } as any),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
      batchApprove: jest.fn(),
    }
    parcelPort = {
      findById: jest.fn(),
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      approveHarvest: jest.fn(),
    }
  })

  it('requires a linked household before farmer submission', async () => {
    const useCase = new CreateJournalEntryUseCase(journalPort, parcelPort)

    await expect(useCase.execute(createInput, 'FARMER')).rejects.toBeInstanceOf(ForbiddenError)
    expect(journalPort.create).not.toHaveBeenCalled()
  })

  it('prevents farmer submission for another household parcel', async () => {
    parcelPort.findById.mockResolvedValue({ id: 'parcel-1', household_id: 'hh-2' } as any)
    const useCase = new CreateJournalEntryUseCase(journalPort, parcelPort)

    await expect(useCase.execute(createInput, 'FARMER', 'hh-1')).rejects.toBeInstanceOf(ForbiddenError)
    expect(journalPort.create).not.toHaveBeenCalled()
  })

  it('allows farmer withdrawal only for own pending journal', async () => {
    journalPort.findById.mockResolvedValue({
      id: 'entry-1',
      parcel_id: 'parcel-1',
      household_id: 'hh-1',
      status: 'PENDING_APPROVAL',
    } as any)
    const useCase = new DeleteJournalEntryUseCase(journalPort)

    await useCase.execute('entry-1', 'FARMER', 'hh-1')

    expect(journalPort.delete).toHaveBeenCalledWith('entry-1')
  })

  it('prevents farmer withdrawal for another household journal', async () => {
    journalPort.findById.mockResolvedValue({
      id: 'entry-1',
      parcel_id: 'parcel-1',
      household_id: 'hh-2',
      status: 'PENDING_APPROVAL',
    } as any)
    const useCase = new DeleteJournalEntryUseCase(journalPort)

    await expect(useCase.execute('entry-1', 'FARMER', 'hh-1')).rejects.toBeInstanceOf(ForbiddenError)
    expect(journalPort.delete).not.toHaveBeenCalled()
  })
})
