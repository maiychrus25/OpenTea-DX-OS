// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { BatchApproveJournalUseCase } from '@/application/journal/BatchApproveJournalUseCase'
import type { JournalPort } from '@/domain/journal/ports/JournalPort'
import { DomainError } from '@/domain/errors'

describe('BatchApproveJournalUseCase', () => {
  const documents = { uploadDocument: jest.fn() } as any

  test('approving nothing is a domain error that names the failed ids', async () => {
    const journal = { batchApprove: jest.fn(async () => ({ approved: 0, failed: ['e1', 'e2'] })) } as unknown as JournalPort
    const useCase = new BatchApproveJournalUseCase(journal, documents)

    const error = await useCase.execute(['e1', 'e2'], 'off-1', 'TC').catch((e) => e)
    expect(error).toBeInstanceOf(DomainError)
    expect(error.message).toBe('Không có nhật ký nào được duyệt. Không duyệt được: e1, e2')
  })

  test('a partly successful batch returns its counts', async () => {
    const journal = { batchApprove: jest.fn(async () => ({ approved: 1, failed: ['e2'] })), findById: jest.fn(async () => null) } as unknown as JournalPort
    const useCase = new BatchApproveJournalUseCase(journal, documents)

    await expect(useCase.execute(['e1', 'e2'], 'off-1', 'TC')).resolves.toEqual({ approved: 1, failed: ['e2'] })
  })
})
