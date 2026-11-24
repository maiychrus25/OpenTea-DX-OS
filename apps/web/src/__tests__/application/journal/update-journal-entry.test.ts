// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { UpdateJournalEntryUseCase } from '@/application/journal/UpdateJournalEntryUseCase'
import type { JournalEntryData, JournalPort } from '@/domain/journal/ports/JournalPort'
import { DomainError } from '@/domain/errors'

function entryWith(status: string): JournalEntryData {
  return { id: 'entry-1', household_id: 'hh1', status } as unknown as JournalEntryData
}

describe('UpdateJournalEntryUseCase (returned entries, rules 3.3)', () => {
  let port: jest.Mocked<Pick<JournalPort, 'findById' | 'update'>>
  let useCase: UpdateJournalEntryUseCase

  beforeEach(() => {
    port = {
      findById: jest.fn(),
      update: jest.fn(async (_id: string, _data: Record<string, unknown>, _resubmit?: boolean) => entryWith('PENDING_APPROVAL')),
    }
    useCase = new UpdateJournalEntryUseCase(port as unknown as JournalPort)
  })

  test.each(['REJECTED', 'REQUEST_CHANGES'])('a %s entry can be edited and goes back to pending', async (status) => {
    port.findById.mockResolvedValue(entryWith(status))

    await useCase.execute('entry-1', { observation: 'Đã sửa liều' }, 'FARMER', 'hh1')

    expect(port.update).toHaveBeenCalledWith('entry-1', { observation: 'Đã sửa liều' }, true)
  })

  test.each(['DRAFT', 'PENDING_APPROVAL'])('a %s entry is updated without a status change', async (status) => {
    port.findById.mockResolvedValue(entryWith(status))

    await useCase.execute('entry-1', { observation: 'x' }, 'FARMER', 'hh1')

    expect(port.update).toHaveBeenCalledWith('entry-1', { observation: 'x' }, false)
  })

  test.each(['APPROVED'])('an %s entry cannot be edited', async (status) => {
    port.findById.mockResolvedValue(entryWith(status))

    await expect(useCase.execute('entry-1', { observation: 'x' }, 'FARMER', 'hh1')).rejects.toThrow(DomainError)
    expect(port.update).not.toHaveBeenCalled()
  })

  test('a farmer cannot edit the returned entry of another household', async () => {
    port.findById.mockResolvedValue(entryWith('REJECTED'))

    await expect(useCase.execute('entry-1', { observation: 'x' }, 'FARMER', 'other-hh')).rejects.toThrow('Bạn không có quyền sửa')
    expect(port.update).not.toHaveBeenCalled()
  })
})
