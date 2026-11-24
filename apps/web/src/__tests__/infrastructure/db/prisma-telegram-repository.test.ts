/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'
import { PrismaTelegramRepository } from '@/infrastructure/db/telegram/PrismaTelegramRepository'

jest.mock('@/infrastructure/db/prisma.client', () => {
  const tx = { $executeRaw: jest.fn(), $queryRaw: jest.fn() }
  return {
    prisma: {
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
      __tx: tx,
    },
  }
})

const mockPrisma = prisma as unknown as {
  $queryRaw: jest.Mock
  __tx: { $executeRaw: jest.Mock; $queryRaw: jest.Mock }
}

/** The bound values of a tagged-template call: SQL text here would reach Postgres as a string literal. */
const valuesOf = (call: unknown[]) => call.slice(1)
const isSqlText = (value: unknown) => typeof value === 'string' && /::text AS|chat_id/.test(value)
/** A Prisma.raw / Prisma.sql fragment whose SQL holds the column list. */
const isColumnFragment = (value: unknown) =>
  typeof value === 'object' && value !== null && /chat_id/.test(String((value as { sql?: unknown }).sql))

describe('PrismaTelegramRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.$queryRaw.mockResolvedValue([])
    mockPrisma.__tx.$queryRaw.mockResolvedValue([])
  })

  test('column lists are SQL fragments, never bound values', async () => {
    const repo = new PrismaTelegramRepository()
    await repo.userLinkRecipients('TC', ['manager'])
    await repo.groupLinkRecipients('TC')
    await repo.activeUserLinkByTelegramUser('1')
    await repo.activeUserLinkByUser('u-1')
    await repo.activeGroupLinkByHtx('TC')
    await repo.outboxRow('00000000-0000-0000-0000-000000000000')
    await repo.proposalSends('00000000-0000-0000-0000-000000000000')
    await repo.lease(5, new Date(), 60)

    const calls = [...mockPrisma.$queryRaw.mock.calls, ...mockPrisma.__tx.$queryRaw.mock.calls]
    expect(calls).toHaveLength(8)
    for (const call of calls) {
      const values = valuesOf(call)
      expect(values.filter(isSqlText)).toEqual([])
      expect(values.some(isColumnFragment)).toBe(true)
    }
  })
})
