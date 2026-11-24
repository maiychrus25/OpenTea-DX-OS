/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { RejectJournalEntryUseCase } from '@/application/journal/RejectJournalEntryUseCase'
import { ValidationError } from '@/domain/errors'
import type { JournalPort } from '@/domain/journal/ports/JournalPort'
import { prisma } from '@/infrastructure/db/prisma.client'
import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository'

jest.mock('@/infrastructure/db/prisma.client', () => {
  const tx = {
    journalEntry: { findUnique: jest.fn(), update: jest.fn() },
    notification: { create: jest.fn() },
  }
  return {
    prisma: {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
      __tx: tx,
    },
  }
})

jest.mock('@/lib/sse-emitter', () => ({
  sseEmitter: { emit: jest.fn() },
  SSE_EVENTS: { NEW_NOTIFICATION: 'new_notification' },
}))

const tx = (prisma as unknown as { __tx: any }).__tx

describe('RejectJournalEntryUseCase & PrismaJournalRepository.review', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('use case rejects blank reason', async () => {
    const port: Pick<JournalPort, 'review'> = { review: jest.fn() }
    const useCase = new RejectJournalEntryUseCase(port)
    await expect(
      useCase.execute('e1', { decision: 'REJECTED', reason: '   ', reviewerId: 'off-1' })
    ).rejects.toThrow(ValidationError)
    expect(port.review).not.toHaveBeenCalled()
  })

  test('repository throws when entry is not PENDING_APPROVAL', async () => {
    tx.journalEntry.findUnique.mockResolvedValueOnce({ id: 'e1', status: 'APPROVED' })
    const repo = new PrismaJournalRepository()
    await expect(repo.review('e1', 'REJECTED', 'Sai ngày', 'off-1')).rejects.toThrow(ValidationError)
    expect(tx.journalEntry.update).not.toHaveBeenCalled()
  })

  test('saves review_note and notifies farmer when submitted_role is FARMER', async () => {
    tx.journalEntry.findUnique.mockResolvedValueOnce({
      id: 'e1',
      status: 'PENDING_APPROVAL',
      activity_type: 'SPRAYING',
      submitted_role: 'FARMER',
      parcel: {
        parcel_code: 'TC-A3',
        household_id: 'hh-1',
        household: { keycloak_user_id: 'kc-farmer-1', htx_profile_id: 'htx-tc' },
      },
    })
    tx.notification.create.mockResolvedValueOnce({ recipient_id: 'kc-farmer-1' })

    const useCase = new RejectJournalEntryUseCase(new PrismaJournalRepository())
    const res = await useCase.execute('e1', {
      decision: 'REQUEST_CHANGES',
      reason: '  Cần ghi rõ 7 ngày cách ly  ',
      reviewerId: 'off-1',
    })

    expect(res).toEqual({ status: 'REQUEST_CHANGES' })
    expect(tx.journalEntry.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { status: 'REQUEST_CHANGES', review_note: 'Cần ghi rõ 7 ngày cách ly' },
    })
    expect(tx.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipient_id: 'kc-farmer-1',
          htx_profile_id: 'htx-tc',
          title: 'Nhật ký cần chỉnh sửa',
        }),
      })
    )
  })

  test('does not notify when entry was submitted by OFFICER', async () => {
    tx.journalEntry.findUnique.mockResolvedValueOnce({
      id: 'e2',
      status: 'PENDING_APPROVAL',
      activity_type: 'FERTILIZING',
      submitted_role: 'OFFICER',
      parcel: {
        parcel_code: 'TC-A1',
        household_id: 'hh-1',
        household: { keycloak_user_id: 'kc-farmer-1', htx_profile_id: 'htx-tc' },
      },
    })

    const res = await new PrismaJournalRepository().review('e2', 'REJECTED', 'Trùng dòng', 'mgr-1')
    expect(res).toEqual({ status: 'REJECTED' })
    expect(tx.notification.create).not.toHaveBeenCalled()
  })
})
