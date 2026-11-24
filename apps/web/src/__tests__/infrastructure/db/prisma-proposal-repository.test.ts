/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'
import { PrismaProposalRepository } from '@/infrastructure/db/agent/PrismaProposalRepository'

jest.mock('@/infrastructure/db/prisma.client', () => {
  const tx = {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
  }
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
  $executeRaw: jest.Mock
  $transaction: jest.Mock
  __tx: { $executeRaw: jest.Mock; $queryRaw: jest.Mock }
}

const sqlOf = (call: unknown[]) => (call[0] as TemplateStringsArray).join('?')

describe('PrismaProposalRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('create uses ON CONFLICT DO NOTHING and records audit event', async () => {
    mockPrisma.__tx.$queryRaw.mockResolvedValueOnce([{ id: 'prop-1' }])
    const repo = new PrismaProposalRepository()

    const res = await repo.create({
      htxCode: 'TC',
      runId: null,
      agent: 'journal-review',
      kind: 'journal.approve',
      payload: { entry_ids: ['e1'] },
      reasonVi: 'OK',
      evidence: { rows: [], sha256: 'abc' },
      confidence: 0.9,
      risk: 'medium',
      origin: 'agent',
      requestedBy: null,
      dedupeKey: 'k1',
      expiresAt: new Date('2026-11-27T00:00:00.000Z'),
    })

    expect(res).toEqual({ id: 'prop-1' })
    const insertSql = sqlOf(mockPrisma.__tx.$queryRaw.mock.calls[0])
    expect(insertSql).toContain('ON CONFLICT (htx_code, kind, dedupe_key)')
    expect(insertSql).toContain("WHERE status IN ('proposed', 'approved')")
    expect(sqlOf(mockPrisma.__tx.$executeRaw.mock.calls[0])).toContain("set_config('dxos.actor'")
    expect(sqlOf(mockPrisma.__tx.$executeRaw.mock.calls[1])).toContain("audit.record_event('web', 'agent.proposal.created'")
  })

  test('claim guards on status=proposed, sets actor and records approved audit event', async () => {
    mockPrisma.__tx.$queryRaw.mockResolvedValueOnce([
      {
        id: 'prop-1',
        htx_code: 'TC',
        run_id: null,
        agent: 'journal-review',
        kind: 'journal.approve',
        payload: { entry_ids: ['e1'] },
        reason_vi: 'OK',
        evidence: { rows: [], sha256: 'abc' },
        confidence: 0.9,
        risk: 'medium',
        status: 'approved',
        origin: 'agent',
        requested_by: null,
        dedupe_key: 'k1',
        created_at: new Date(),
        expires_at: new Date(),
        decided_by: 'u1',
        decided_by_name: 'Trưởng HTX',
        decided_at: new Date(),
        decision_channel: 'web',
        decision_note: null,
        edited_payload: null,
        executed_at: null,
        result: null,
      },
    ])

    const repo = new PrismaProposalRepository()
    const claimed = await repo.claim('TC', 'prop-1', {
      userId: 'u1',
      userName: 'Trưởng HTX',
      role: 'manager',
      channel: 'web',
      note: null,
      editedPayload: null,
    })

    expect(claimed?.status).toBe('approved')
    const updateSql = sqlOf(mockPrisma.__tx.$queryRaw.mock.calls[0])
    expect(updateSql).toContain("status = 'proposed'")
    expect(updateSql).toContain('expires_at > now()')
    expect(sqlOf(mockPrisma.__tx.$executeRaw.mock.calls[0])).toContain("set_config('dxos.actor'")
    expect(sqlOf(mockPrisma.__tx.$executeRaw.mock.calls[1])).toContain("audit.record_event('web', 'agent.proposal.approved'")
  })
})
