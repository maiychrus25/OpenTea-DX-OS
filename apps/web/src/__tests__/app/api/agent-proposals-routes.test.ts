/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import { GET as listProposals } from '@/app/api/agent/proposals/route'
import { POST as decideProposal } from '@/app/api/agent/proposals/[id]/decision/route'
import { ForbiddenError, ValidationError } from '@/domain/errors'
import { requireTenant } from '@/lib/api/tenant'

const listExecute = jest.fn()
const decideExecute = jest.fn()
const findJournalById = jest.fn()
const guardJournalEntry = jest.fn()

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/tenant', () => ({
  requireTenant: jest.fn(),
}))
jest.mock('@/lib/api/tenant-guard', () => ({
  TenantGuard: jest.fn().mockImplementation(() => ({ journalEntry: guardJournalEntry })),
}))
jest.mock('@/application/agent/ListProposalsUseCase', () => ({
  ListProposalsUseCase: jest.fn().mockImplementation(() => ({ execute: listExecute })),
}))
jest.mock('@/application/agent/DecideProposalUseCase', () => ({
  DecideProposalUseCase: jest.fn().mockImplementation(() => ({ execute: decideExecute })),
}))
jest.mock('@/infrastructure/db/agent/PrismaProposalRepository', () => ({ PrismaProposalRepository: jest.fn() }))
jest.mock('@/infrastructure/db/journal/PrismaJournalRepository', () => ({
  PrismaJournalRepository: jest.fn().mockImplementation(() => ({ findById: findJournalById })),
}))

const VALID_ID = '00000000-0000-0000-0000-000000000001'

describe('Agent proposals HTTP routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'mgr-1', name: 'Trưởng HTX', role: 'manager' } })
    ;(requireTenant as jest.Mock).mockResolvedValue({ userId: 'mgr-1', role: 'manager', htxCode: 'TC', htxProfileId: 'htx-tc' })
    guardJournalEntry.mockResolvedValue(undefined)
  })

  test('GET /api/agent/proposals denies farmer with 403', async () => {
    ;(requireTenant as jest.Mock).mockResolvedValueOnce({ userId: 'f1', role: 'farmer', htxCode: 'TC', htxProfileId: 'htx-tc' })
    const res = await listProposals(new Request('http://web/api/agent/proposals?view=open'), undefined)
    expect(res.status).toBe(403)
  })

  test('GET /api/agent/proposals enriches titleVi, preview, canDecide and subjects', async () => {
    listExecute.mockResolvedValueOnce([
      {
        id: VALID_ID,
        htxCode: 'TC',
        runId: null,
        agent: 'journal-review',
        kind: 'journal.approve',
        payload: { entry_ids: ['e1'] },
        reasonVi: 'Nhật ký sạch',
        evidence: { rows: [{ table: 'journal_entries', id: 'e1', sha256: 'abc' }], sha256: 'def' },
        confidence: 0.9,
        risk: 'medium',
        status: 'proposed',
        origin: 'agent',
        requestedBy: null,
        dedupeKey: 'k1',
        createdAt: new Date('2026-11-24T00:00:00.000Z'),
        expiresAt: new Date('2026-11-27T00:00:00.000Z'),
      },
    ])
    findJournalById.mockResolvedValueOnce({
      id: 'e1',
      parcel_id: 'p1',
      parcel_code: 'TC-A3',
      activity_type: 'FERTILIZING',
      entry_date: new Date('2026-11-23T00:00:00.000Z'),
    })

    const res = await listProposals(new Request('http://web/api/agent/proposals?view=open'), undefined)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data[0]).toMatchObject({
      titleVi: 'Duyệt nhật ký canh tác',
      canDecide: true,
      preview: ['Duyệt nhật ký e1'],
      subjects: [{ id: 'e1', label: 'Thửa TC-A3 · FERTILIZING · 23/11' }],
    })
  })

  test('POST /api/agent/proposals/[id]/decision maps 200, 400, 403 and 409 outcomes', async () => {
    const callDecision = (id: string, body: unknown) =>
      decideProposal(new Request(`http://web/api/agent/proposals/${id}/decision`, { method: 'POST', body: JSON.stringify(body) }), {
        params: { id },
      })

    const badUuid = await callDecision('not-a-uuid', { decision: 'approve' })
    expect(badUuid.status).toBe(400)

    decideExecute.mockResolvedValueOnce({ outcome: 'executed', result: { approved_count: 1 } })
    const okRes = await callDecision(VALID_ID, { decision: 'approve' })
    expect(okRes.status).toBe(200)

    decideExecute.mockResolvedValueOnce({
      outcome: 'already_decided',
      by: 'Cán bộ A',
      at: new Date('2026-11-24T01:05:00.000Z'),
      status: 'executed',
    })
    const conflictRes = await callDecision(VALID_ID, { decision: 'approve' })
    expect(conflictRes.status).toBe(409)
    const conflictJson = await conflictRes.json()
    expect(conflictJson.error.message).toContain('Cán bộ A')

    decideExecute.mockRejectedValueOnce(new ForbiddenError('Không đủ quyền'))
    expect((await callDecision(VALID_ID, { decision: 'approve' })).status).toBe(403)

    decideExecute.mockRejectedValueOnce(new ValidationError('Thiếu lý do'))
    expect((await callDecision(VALID_ID, { decision: 'reject' })).status).toBe(400)
  })
})
