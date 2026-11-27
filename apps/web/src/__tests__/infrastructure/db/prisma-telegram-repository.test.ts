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

  test('a flow is stored as a flow: no proposal, the state as jsonb and the token', async () => {
    const repo = new PrismaTelegramRepository()
    const expiresAt = new Date('2026-11-26T10:30:00Z')
    await repo.setFlow({
      telegramUserId: '42',
      flow: 'journal.create',
      step: 1,
      state: { parcel_id: 'p1' },
      token: 'tokenABCDEF',
      cardMessageId: null,
      expiresAt,
    })
    const [strings, ...values] = mockPrisma.__tx.$executeRaw.mock.calls[1]
    const sql = (strings as string[]).join('?')
    expect(sql).toContain('?, NULL')
    expect(values).toContain('flow')
    expect(values).toContain('journal.create')
    expect(values).toContain(JSON.stringify({ parcel_id: 'p1' }))
    expect(values).toContain('tokenABCDEF')
  })

  test('a voice conversation is stored with the kind voice', async () => {
    const repo = new PrismaTelegramRepository()
    await repo.setFlow({
      telegramUserId: '42', kind: 'voice', flow: 'voice', step: null, state: { text: 'hôm nay' },
      token: 'tokenABCDEF', cardMessageId: null, expiresAt: new Date('2026-11-26T10:30:00Z'),
    })
    const [, ...values] = mockPrisma.__tx.$executeRaw.mock.calls[1]
    expect(values).toContain('voice')
    expect(values).not.toContain('flow')
  })

  test('a reject reason clears the flow columns when it replaces a flow', async () => {
    const repo = new PrismaTelegramRepository()
    await repo.setConversation({ telegramUserId: '42', proposalId: '00000000-0000-4000-8000-000000000001', expiresAt: new Date() })
    const [strings] = mockPrisma.__tx.$executeRaw.mock.calls[1]
    expect((strings as string[]).join('?')).toContain("flow = NULL, step = NULL, state = '{}'::jsonb, token = NULL")
  })

  test('conversationOf reads the row without an expiry filter, and the active read keeps it', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      { telegram_user_id: '42', kind: 'flow', proposal_id: null, flow: 'ask', step: null, state: {}, token: null,
        card_message_id: null, expires_at: new Date('2020-01-01T00:00:00Z') },
    ])
    const repo = new PrismaTelegramRepository()
    const row = await repo.conversationOf('42')
    expect(row).toMatchObject({ kind: 'flow', flow: 'ask', proposalId: null })
    const [strings] = mockPrisma.$queryRaw.mock.calls[0]
    expect((strings as string[]).join('?')).not.toContain('expires_at >')
  })

  test('the update row keeps the Telegram user and the rate limit counts from the window start', async () => {
    mockPrisma.__tx.$queryRaw.mockResolvedValueOnce([{ update_id: '7' }])
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ count: 3 }])
    const repo = new PrismaTelegramRepository()
    expect(await repo.markUpdateSeen('7', '42')).toBe(true)
    const [, ...seenValues] = mockPrisma.__tx.$queryRaw.mock.calls[0]
    expect(seenValues).toEqual(['7', '42'])

    const since = new Date('2026-11-26T09:00:00Z')
    expect(await repo.countRecentUpdates('42', since)).toBe(3)
    const [, ...countValues] = mockPrisma.$queryRaw.mock.calls[0]
    expect(countValues).toEqual(['42', since])
  })

  test('the audit event goes through audit.record_event with the actor in its details', async () => {
    const repo = new PrismaTelegramRepository()
    await repo.auditEvent('user-1', 'telegram.action.executed', 'TC', { kind: 'journal.create', htx_code: 'TC', channel: 'telegram' })
    const [strings, ...values] = mockPrisma.__tx.$executeRaw.mock.calls[1]
    expect((strings as string[]).join('?')).toContain('audit.record_event')
    expect(values[0]).toBe('telegram.action.executed')
    expect(JSON.parse(String(values[2]))).toMatchObject({ actor: 'user-1', channel: 'telegram' })
  })
})
