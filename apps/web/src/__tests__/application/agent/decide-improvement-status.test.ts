/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { DecideProposalUseCase } from '@/application/agent/DecideProposalUseCase'
import { evidenceDigest } from '@/domain/agent/evidence'
import type { Proposal } from '@/domain/agent/proposal'
import type { Tenant } from '@/lib/api/tenant'

beforeEach(() => jest.clearAllMocks())

const manager: Tenant = { userId: 'mgr-1', role: 'manager', htxCode: 'TC', htxProfileId: 'htx-tc' }
const NOW = new Date('2026-11-30T06:45:00Z')

function proposalOf(kind: string, payload: Record<string, unknown>): Proposal {
  const evidence = { rows: [], sha256: evidenceDigest([]) }
  return {
    id: '00000000-0000-0000-0000-000000000010',
    htxCode: 'TC',
    runId: null,
    agent: 'improvement',
    kind,
    payload,
    reasonVi: 'r',
    evidence,
    confidence: null,
    risk: 'low',
    status: 'proposed',
    origin: 'agent',
    requestedBy: null,
    dedupeKey: 'k',
    createdAt: NOW,
    expiresAt: new Date('2999-01-01T00:00:00Z'),
    decidedBy: null,
    decidedByName: null,
    decidedAt: null,
    decisionChannel: null,
    decisionNote: null,
    editedPayload: null,
    executedAt: null,
    result: null,
    subjects: [],
  } as unknown as Proposal
}

function build(proposal: Proposal, executes: 'ok' | 'throw' | 'stale' = 'ok') {
  const repo = {
    findById: jest.fn().mockResolvedValue(proposal),
    claim: jest.fn().mockResolvedValue(proposal),
    markRejected: jest.fn().mockResolvedValue(proposal),
    markStale: jest.fn().mockResolvedValue(true),
    markExpired: jest.fn(),
    markExecuted: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
  }
  const improvements = { settleProposal: jest.fn().mockResolvedValue(undefined) }
  const runExecute = jest.fn(async () => {
    if (executes === 'throw') throw new Error('boom')
    return { ok: true }
  })
  const loaders = { improvements: async () => ({}), agent_settings: async () => ({ thresholds: {}, schedule: null }) }
  const useCase = new DecideProposalUseCase(repo, loaders, runExecute, undefined, improvements)
  return { useCase, improvements, repo }
}

describe('a decided proposal moves its improvement (status follows the proposal)', () => {
  it('approved and executed: the improvement of a settings change becomes adopted', async () => {
    const { useCase, improvements } = build(proposalOf('agent.settings.update', { agent: 'field-watch', thresholds: { silent_hours: 8 } }))
    const outcome = await useCase.execute({ proposalId: '00000000-0000-0000-0000-000000000010', tenant: manager, userName: 'Quản lý', decision: 'approve', channel: 'web', now: NOW })
    expect(outcome.outcome).toBe('executed')
    expect(improvements.settleProposal).toHaveBeenCalledWith('TC', '00000000-0000-0000-0000-000000000010', {
      status: 'adopted',
      decidedBy: 'mgr-1',
      adoptedAt: NOW,
    })
  })

  it('approved and executed: a process improvement becomes adopted', async () => {
    const { useCase, improvements } = build(proposalOf('improvement.adopt', { improvement_id: '00000000-0000-0000-0000-000000000020' }))
    await useCase.execute({ proposalId: '00000000-0000-0000-0000-000000000010', tenant: manager, userName: 'Quản lý', decision: 'approve', channel: 'telegram', now: NOW })
    expect(improvements.settleProposal).toHaveBeenCalledWith('TC', '00000000-0000-0000-0000-000000000010', expect.objectContaining({ status: 'adopted' }))
  })

  it('rejected: the improvement becomes declined', async () => {
    const { useCase, improvements } = build(proposalOf('improvement.adopt', { improvement_id: '00000000-0000-0000-0000-000000000020' }))
    const outcome = await useCase.execute({ proposalId: '00000000-0000-0000-0000-000000000010', tenant: manager, userName: 'Quản lý', decision: 'reject', note: 'Chưa cần', channel: 'web', now: NOW })
    expect(outcome.outcome).toBe('rejected')
    expect(improvements.settleProposal).toHaveBeenCalledWith('TC', '00000000-0000-0000-0000-000000000010', { status: 'declined', decidedBy: 'mgr-1' })
  })

  it('a failed execution leaves the improvement proposed', async () => {
    const { useCase, improvements } = build(proposalOf('improvement.adopt', { improvement_id: '00000000-0000-0000-0000-000000000020' }), 'throw')
    const outcome = await useCase.execute({ proposalId: '00000000-0000-0000-0000-000000000010', tenant: manager, userName: 'Quản lý', decision: 'approve', channel: 'web', now: NOW })
    expect(outcome.outcome).toBe('failed')
    expect(improvements.settleProposal).not.toHaveBeenCalled()
  })

  it('a stale proposal leaves the improvement proposed', async () => {
    const proposal = proposalOf('agent.settings.update', { agent: 'field-watch', thresholds: { silent_hours: 8 } })
    const { useCase, improvements, repo } = build(proposal)
    proposal.evidence = { rows: [{ table: 'agent_settings', id: 'TC:field-watch', sha256: 'stale' }], sha256: evidenceDigest([{ table: 'agent_settings', id: 'TC:field-watch', sha256: 'stale' }]) }
    repo.findById.mockResolvedValue(proposal)
    const outcome = await useCase.execute({ proposalId: proposal.id, tenant: manager, userName: 'Quản lý', decision: 'approve', channel: 'web', now: NOW })
    expect(outcome.outcome).toBe('stale')
    expect(improvements.settleProposal).not.toHaveBeenCalled()
  })

  it('a settle failure never changes the decision outcome', async () => {
    const { useCase, improvements } = build(proposalOf('improvement.adopt', { improvement_id: '00000000-0000-0000-0000-000000000020' }))
    improvements.settleProposal.mockRejectedValueOnce(new Error('db down'))
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const outcome = await useCase.execute({ proposalId: '00000000-0000-0000-0000-000000000010', tenant: manager, userName: 'Quản lý', decision: 'approve', channel: 'web', now: NOW })
    expect(outcome.outcome).toBe('executed')
    errorSpy.mockRestore()
  })
})
