/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository'
import { prisma } from '@/infrastructure/db/prisma.client'
import { ValidationError } from '@/domain/errors'

jest.mock('@/infrastructure/db/prisma.client', () => {
  const tx = { journalEntry: { findUnique: jest.fn(), updateMany: jest.fn() } }
  return { prisma: { $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)), __tx: tx } }
})

const tx = (prisma as unknown as { __tx: { journalEntry: { findUnique: jest.Mock; updateMany: jest.Mock } } }).__tx

const pendingEntry = {
  id: 'entry-1',
  parcel_id: 'parcel-1',
  activity_type: 'SPRAYING',
  entry_date: new Date('2026-11-20T00:00:00.000Z'),
  submitted_role: 'OFFICER',
  status: 'PENDING_APPROVAL',
  parcel: { parcel_code: 'A3', household_id: 'hh1', household: { keycloak_user_id: null, htx_profile_id: 'htx-tc' } },
}

describe('PrismaJournalRepository status updates are conditional', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    tx.journalEntry.findUnique.mockResolvedValue(pendingEntry)
  })

  test('review updates only a pending entry and stores the reviewer', async () => {
    tx.journalEntry.updateMany.mockResolvedValueOnce({ count: 1 })
    const repo = new PrismaJournalRepository()

    await expect(repo.review('entry-1', 'REJECTED', 'Sai liều', 'off-1')).resolves.toEqual({ status: 'REJECTED' })
    expect(tx.journalEntry.updateMany).toHaveBeenCalledWith({
      where: { id: 'entry-1', status: 'PENDING_APPROVAL' },
      data: { status: 'REJECTED', review_note: 'Sai liều', reviewed_by_id: 'off-1' },
    })
  })

  test('review reports a domain error when the entry was no longer pending', async () => {
    tx.journalEntry.updateMany.mockResolvedValue({ count: 0 })
    const repo = new PrismaJournalRepository()

    await expect(repo.review('entry-1', 'REJECTED', 'Sai liều', 'off-1')).rejects.toThrow(ValidationError)
    await expect(repo.review('entry-1', 'REJECTED', 'Sai liều', 'off-1')).rejects.toThrow('không còn ở trạng thái chờ duyệt')
  })

  test('batchApprove lists an entry that was decided concurrently as failed', async () => {
    tx.journalEntry.updateMany.mockResolvedValueOnce({ count: 0 })
    const repo = new PrismaJournalRepository()

    await expect(repo.batchApprove(['entry-1'], 'off-1')).resolves.toEqual({ approved: 0, failed: ['entry-1'] })
    expect(tx.journalEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'entry-1', status: 'PENDING_APPROVAL' } })
    )
  })
})
