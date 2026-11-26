/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { POST as postRun } from '@/app/api/internal/agent/runs/route'
import { PATCH as patchRun } from '@/app/api/internal/agent/runs/[id]/route'
import { POST as postProposal } from '@/app/api/internal/agent/proposals/route'
import { ForbiddenError, ValidationError } from '@/domain/errors'
import { requireAgentCaller } from '@/lib/api/internal-agent-auth'

const startRunMock = jest.fn()
const finishRunMock = jest.fn()
const existsForHtxMock = jest.fn()
const createProposalExecuteMock = jest.fn()

jest.mock('@/lib/api/internal-agent-auth', () => ({
  requireAgentCaller: jest.fn(),
}))

jest.mock('@/infrastructure/db/agent/PrismaAgentRunRepository', () => ({
  PrismaAgentRunRepository: jest.fn().mockImplementation(() => ({
    start: startRunMock,
    finish: finishRunMock,
    existsForHtx: existsForHtxMock,
  })),
}))

jest.mock('@/application/agent/CreateProposalUseCase', () => ({
  CreateProposalUseCase: jest.fn().mockImplementation(() => ({
    execute: createProposalExecuteMock,
  })),
}))

jest.mock('@/infrastructure/db/agent/PrismaProposalRepository', () => ({
  PrismaProposalRepository: jest.fn(),
}))

const RUN_UUID = '00000000-0000-0000-0000-000000000010'
const PROP_UUID = '00000000-0000-0000-0000-000000000020'

describe('Internal agent API routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(requireAgentCaller as jest.Mock).mockResolvedValue({
      sub: 'sa-tc',
      azp: 'dxos-agent-tc',
      htxCode: 'TC',
      roles: ['agent'],
    })
    existsForHtxMock.mockResolvedValue(true)
  })

  test('POST /api/internal/agent/runs starts a run scoped to caller HTX and returns 201', async () => {
    startRunMock.mockResolvedValueOnce({ id: RUN_UUID })
    const res = await postRun(
      new Request('http://web/api/internal/agent/runs', {
        method: 'POST',
        body: JSON.stringify({
          htx_code: 'LB',
          agent: 'journal-review',
          trigger: 'schedule',
          provider: 'replay',
          model: 'replay-v1',
        }),
      }),
      undefined
    )
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ data: { id: RUN_UUID } })
    expect(startRunMock).toHaveBeenCalledWith(
      expect.objectContaining({
        htxCode: 'TC',
        agent: 'journal-review',
        trigger: 'schedule',
        provider: 'replay',
        model: 'replay-v1',
      })
    )
  })

  test('POST /api/internal/agent/runs accepts the assistant (A7) with trigger message', async () => {
    startRunMock.mockResolvedValueOnce({ id: RUN_UUID })
    const res = await postRun(
      new Request('http://web/api/internal/agent/runs', {
        method: 'POST',
        body: JSON.stringify({ agent: 'assistant', trigger: 'message', provider: 'ollama' }),
      }),
      undefined
    )
    expect(res.status).toBe(201)
    expect(startRunMock).toHaveBeenCalledWith(expect.objectContaining({ htxCode: 'TC', agent: 'assistant', trigger: 'message' }))
  })

  test('POST /api/internal/agent/runs propagates 403 when gateway header fails and 400 on bad trigger', async () => {
    ;(requireAgentCaller as jest.Mock).mockRejectedValueOnce(new ForbiddenError('INTERNAL_GATEWAY_REQUIRED'))
    const denied = await postRun(new Request('http://web/api/internal/agent/runs', { method: 'POST' }), undefined)
    expect(denied.status).toBe(403)

    const bad = await postRun(
      new Request('http://web/api/internal/agent/runs', {
        method: 'POST',
        body: JSON.stringify({ agent: 'a1', trigger: 'cron' }),
      }),
      undefined
    )
    expect(bad.status).toBe(400)
  })

  test('PATCH /api/internal/agent/runs/[id] updates owned run and returns 404 for cross-HTX/missing run', async () => {
    finishRunMock.mockResolvedValueOnce(true)
    const okRes = await patchRun(
      new Request(`http://web/api/internal/agent/runs/${RUN_UUID}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ok', tokens_in: 100, tokens_out: 25, cost_estimate: 0 }),
      }),
      { params: { id: RUN_UUID } }
    )
    expect(okRes.status).toBe(200)
    expect(finishRunMock).toHaveBeenCalledWith(
      'TC',
      RUN_UUID,
      expect.objectContaining({ status: 'ok', tokensIn: 100, tokensOut: 25, costEstimate: 0 })
    )

    finishRunMock.mockResolvedValueOnce(false)
    const missingRes = await patchRun(
      new Request(`http://web/api/internal/agent/runs/${RUN_UUID}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'failed', error: 'boom' }),
      }),
      { params: { id: RUN_UUID } }
    )
    expect(missingRes.status).toBe(404)

    const invalidId = await patchRun(
      new Request('http://web/api/internal/agent/runs/not-a-uuid', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ok' }),
      }),
      { params: { id: 'not-a-uuid' } }
    )
    expect(invalidId.status).toBe(400)
  })

  test('POST /api/internal/agent/proposals ignores body htx_code and handles 201, 200 deduped and 400 validation', async () => {
    const validBody = {
      htx_code: 'LB',
      run_id: RUN_UUID,
      agent: 'journal-review',
      kind: 'journal.approve',
      payload: { entry_ids: ['e1'] },
      reason_vi: 'Nhật ký hợp lệ',
      evidence: { rows: [{ table: 'journal_entries', id: 'e1', sha256: 'abc' }], sha256: 'root' },
      confidence: 0.92,
    }

    createProposalExecuteMock.mockResolvedValueOnce({ id: PROP_UUID })
    const created = await postProposal(
      new Request('http://web/api/internal/agent/proposals', {
        method: 'POST',
        body: JSON.stringify(validBody),
      }),
      undefined
    )
    expect(created.status).toBe(201)
    expect(await created.json()).toEqual({ data: { id: PROP_UUID, deduped: false } })
    expect(createProposalExecuteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        htxCode: 'TC',
        origin: 'agent',
        kind: 'journal.approve',
      })
    )

    createProposalExecuteMock.mockResolvedValueOnce(null)
    const deduped = await postProposal(
      new Request('http://web/api/internal/agent/proposals', {
        method: 'POST',
        body: JSON.stringify(validBody),
      }),
      undefined
    )
    expect(deduped.status).toBe(200)
    expect(await deduped.json()).toEqual({ data: { id: null, deduped: true } })

    createProposalExecuteMock.mockRejectedValueOnce(new ValidationError('UNKNOWN_KIND'))
    const badKind = await postProposal(
      new Request('http://web/api/internal/agent/proposals', {
        method: 'POST',
        body: JSON.stringify(validBody),
      }),
      undefined
    )
    expect(badKind.status).toBe(400)

    existsForHtxMock.mockResolvedValueOnce(false)
    const foreignRun = await postProposal(
      new Request('http://web/api/internal/agent/proposals', {
        method: 'POST',
        body: JSON.stringify(validBody),
      }),
      undefined
    )
    expect(foreignRun.status).toBe(400)
  })
})
