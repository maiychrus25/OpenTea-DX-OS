// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { UpdateJournalEntryUseCase } from '@/application/journal/UpdateJournalEntryUseCase'
import type { JournalEntryData, JournalPort } from '@/domain/journal/ports/JournalPort'
import type { PesticidePort } from '@/domain/pesticide/ports/PesticidePort'
import { ForbiddenError, WithdrawalBelowFloorError } from '@/domain/errors'

const entry = (status: string, submitted_role = 'FARMER') =>
  ({ id: 'e1', household_id: 'hh1', status, submitted_role }) as unknown as JournalEntryData

describe('UpdateJournalEntryUseCase resubmission', () => {
  const port = { findById: jest.fn(), update: jest.fn(async () => ({}) as JournalEntryData) }
  const pesticides: PesticidePort = {
    floorFor: jest.fn(async () => ({ productId: 'catex', floorDays: 14 })),
    matchByTradeName: jest.fn(async () => null),
    list: jest.fn(),
    setLabel: jest.fn(),
    clearLabel: jest.fn(),
  }
  const useCase = new UpdateJournalEntryUseCase(port as unknown as JournalPort, pesticides)
  const actor = { id: 'farmer-1', name: 'Nông dân A' }

  beforeEach(() => jest.clearAllMocks())

  it('a REQUEST_CHANGES entry takes new activities with the floor applied and goes back to the queue', async () => {
    port.findById.mockResolvedValue(entry('REQUEST_CHANGES'))

    await useCase.execute(
      'e1',
      { activities: [{ activity_type: 'SPRAYING', pesticide_product_id: 'catex' }], submit: true },
      'FARMER',
      'hh1',
      'htx',
      actor
    )

    expect(port.update).toHaveBeenCalledWith(
      'e1',
      { activities: [{ activity_type: 'SPRAYING', pesticide_product_id: 'catex', withdrawal_days: 14 }] },
      true
    )
  })

  it('rejects new activities below the floor', async () => {
    port.findById.mockResolvedValue(entry('REQUEST_CHANGES'))
    await expect(
      useCase.execute(
        'e1',
        { activities: [{ activity_type: 'SPRAYING', pesticide_product_id: 'catex', withdrawal_days: 5 }], submit: true },
        'FARMER',
        'hh1',
        'htx',
        actor
      )
    ).rejects.toBeInstanceOf(WithdrawalBelowFloorError)
    expect(port.update).not.toHaveBeenCalled()
  })

  it('a notes-only PUT on an old spray below the floor succeeds without a floor check', async () => {
    port.findById.mockResolvedValue(entry('PENDING_APPROVAL'))

    await useCase.execute('e1', { observation: 'Bổ sung ghi chú' }, 'FARMER', 'hh1', 'htx')

    expect(pesticides.floorFor).not.toHaveBeenCalled()
    expect(port.update).toHaveBeenCalledWith('e1', { observation: 'Bổ sung ghi chú' }, false)
  })

  it('a farmer submitting an officer-authored DRAFT becomes the submitter', async () => {
    port.findById.mockResolvedValue(entry('DRAFT', 'OFFICER'))

    await useCase.execute('e1', { submit: true }, 'FARMER', 'hh1', 'htx', actor)

    expect(port.update).toHaveBeenCalledWith(
      'e1',
      { submitted_by_id: 'farmer-1', submitted_role: 'FARMER', performed_by: 'Nông dân A' },
      true
    )
  })

  it('saving a DRAFT without submit keeps it a draft', async () => {
    port.findById.mockResolvedValue(entry('DRAFT', 'OFFICER'))
    await useCase.execute('e1', { observation: 'x' }, 'FARMER', 'hh1', 'htx', actor)
    expect(port.update).toHaveBeenCalledWith('e1', { observation: 'x' }, false)
  })

  it('an officer cannot submit', async () => {
    port.findById.mockResolvedValue(entry('DRAFT', 'OFFICER'))
    await expect(useCase.execute('e1', { submit: true }, 'OFFICER', undefined, 'htx')).rejects.toBeInstanceOf(ForbiddenError)
  })
})
