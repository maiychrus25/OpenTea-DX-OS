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
    mockPrisma.__tx.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'prop-1' }])
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
      subjects: ['e1'],
      expiresAt: new Date('2026-11-27T00:00:00.000Z'),
    })

    expect(res).toEqual({ id: 'prop-1' })
    const insertSql = sqlOf(mockPrisma.__tx.$queryRaw.mock.calls[1])
    expect(insertSql).toContain('ON CONFLICT (htx_code, kind, dedupe_key)')
    expect(insertSql).toContain("WHERE status IN ('proposed', 'approved')")
    expect(insertSql).toContain('AND subject_ids && ')
    expect(sqlOf(mockPrisma.__tx.$executeRaw.mock.calls[0])).toContain("set_config('dxos.actor'")
    expect(sqlOf(mockPrisma.__tx.$executeRaw.mock.calls[1])).toContain('pg_advisory_xact_lock(hashtext(')
    expect(sqlOf(mockPrisma.__tx.$executeRaw.mock.calls[2])).toContain("audit.record_event('web', 'agent.proposal.created'")
  })

  test('create expires overdue proposals that cover the same subjects, with an audit event', async () => {
    mockPrisma.__tx.$queryRaw.mockResolvedValueOnce([{ id: 'old-1' }]).mockResolvedValueOnce([{ id: 'prop-2' }])
    const repo = new PrismaProposalRepository()

    await repo.create({
      htxCode: 'TC',
      runId: null,
      agent: 'journal-review',
      kind: 'journal.approve',
      payload: { entry_ids: ['e1'] },
      reasonVi: 'OK',
      evidence: { rows: [], sha256: 'abc' },
      confidence: null,
      risk: 'medium',
      origin: 'agent',
      requestedBy: null,
      dedupeKey: 'k1',
      subjects: ['e1'],
      expiresAt: new Date('2026-11-27T00:00:00.000Z'),
    })

    expect(sqlOf(mockPrisma.__tx.$queryRaw.mock.calls[0])).toContain("SET status = 'expired'")
    expect(sqlOf(mockPrisma.__tx.$executeRaw.mock.calls[2])).toContain("audit.record_event('web', 'agent.proposal.expired'")
  })

  test('list fails approvals stuck for ten minutes and leaves out overdue proposals', async () => {
    mockPrisma.__tx.$queryRaw.mockResolvedValueOnce([{ id: 'stuck-1' }])
    mockPrisma.$queryRaw.mockResolvedValueOnce([])
    const repo = new PrismaProposalRepository()

    await expect(repo.list('TC', { statuses: ['proposed'], limit: 10 })).resolves.toEqual([])
    expect(sqlOf(mockPrisma.__tx.$queryRaw.mock.calls[0])).toContain("interval '10 minutes'")
    expect(sqlOf(mockPrisma.__tx.$executeRaw.mock.calls[1])).toContain("audit.record_event('web', 'agent.proposal.failed'")
    expect(sqlOf(mockPrisma.$queryRaw.mock.calls[0])).toContain("NOT (status = 'proposed' AND expires_at <= now())")
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

  test('markExecuted records agent, kind and subjects with the approver as actor', async () => {
    const repo = new PrismaProposalRepository()

    await repo.markExecuted('prop-1', { approved_count: 1 }, {
      actorId: 'u1',
      agent: 'journal-review',
      kind: 'journal.approve',
      subjectIds: ['e1'],
    })

    // Third statement is the audit call: values are the event, the proposal id and the JSON details.
    const details = JSON.parse((mockPrisma.__tx.$executeRaw.mock.calls[2] as unknown[])[3] as string)
    expect(details).toMatchObject({ actor: 'user:u1', agent: 'journal-review', kind: 'journal.approve', subject_ids: ['e1'] })
  })

  test('markExecuted moves a task waiting for the staff app to sent_to_staff_app, not executed', async () => {
    const repo = new PrismaProposalRepository()

    await repo.markExecuted('prop-1', { state: 'waiting_for_staff_app' }, { actorId: 'u1', kind: 'staff.task.create' })

    const update = mockPrisma.__tx.$executeRaw.mock.calls[1] as unknown[]
    expect(sqlOf(update)).toContain('SET status = ?::text')
    expect(update.slice(1)).toContain('sent_to_staff_app')
    expect(update.slice(1)).not.toContain('executed')
    expect(mockPrisma.__tx.$executeRaw.mock.calls[2]).toContain('agent.proposal.sent_to_staff_app')
  })

  test('markExecuted still marks every other result executed', async () => {
    await new PrismaProposalRepository().markExecuted('prop-1', { approved_count: 1 })

    const update = mockPrisma.__tx.$executeRaw.mock.calls[1] as unknown[]
    expect(update.slice(1)).toContain('executed')
    expect(mockPrisma.__tx.$executeRaw.mock.calls[2]).toContain('agent.proposal.executed')
  })

  test('countOpen counts only proposals still awaiting a decision', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ count: 3 }])
    const repo = new PrismaProposalRepository()

    await expect(repo.countOpen('TC')).resolves.toBe(3)
    const sql = sqlOf(mockPrisma.$queryRaw.mock.calls[0])
    expect(sql).toContain("status = 'proposed' AND expires_at > now()")
  })
})
