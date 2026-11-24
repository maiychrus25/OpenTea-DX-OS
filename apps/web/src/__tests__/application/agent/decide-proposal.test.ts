/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { journalEntryEvidence, journalEntryValues, type EvidenceJournalEntry } from '@/application/agent/actions/journal-evidence'
import { DecideProposalUseCase } from '@/application/agent/DecideProposalUseCase'
import { evidenceDigest } from '@/domain/agent/evidence'
import type { Proposal } from '@/domain/agent/proposal'
import { DomainError, ForbiddenError, ValidationError } from '@/domain/errors'
import type { Tenant } from '@/lib/api/tenant'

const officerTenant: Tenant = { userId: 'off-1', role: 'officer', htxCode: 'TC', htxProfileId: 'htx-tc' }
const farmerTenant: Tenant = { userId: 'far-1', role: 'farmer', htxCode: 'TC', htxProfileId: 'htx-tc' }

function makeEntry(overrides: Partial<EvidenceJournalEntry> = {}): EvidenceJournalEntry {
  return {
    id: 'entry-1',
    parcel_id: 'parcel-1',
    entry_date: new Date('2026-11-20T00:00:00.000Z'),
    activity_type: 'SPRAYING',
    status: 'PENDING_APPROVAL',
    notes: null,
    updated_at: new Date('2026-11-20T00:00:00.000Z'),
    activities: [{ id: 'act-1', activity_detail: 'Phun', product_name: 'Bio', dosage: '10ml', withdrawal_days: 7, safe_harvest_date: null }],
    ...overrides,
  }
}

function makeProposal(entry: EvidenceJournalEntry, overrides: Partial<Proposal> = {}): Proposal {
  const row = journalEntryEvidence(entry)
  return {
    id: '00000000-0000-0000-0000-000000000001',
    htxCode: 'TC',
    runId: null,
    agent: 'journal-review',
    kind: 'journal.reject',
    payload: {
      entry_id: entry.id,
      decision: 'REQUEST_CHANGES',
      reason_code: 'WITHDRAWAL_PERIOD',
      reason_vi: 'Thiếu số ngày cách ly chuẩn 7 ngày',
    },
    reasonVi: 'Số ngày cách ly chưa khớp',
    evidence: { rows: [row], sha256: evidenceDigest([row]) },
    confidence: 0.9,
    risk: 'medium',
    status: 'proposed',
    origin: 'agent',
    requestedBy: null,
    dedupeKey: 'journal.reject:entry-1',
    createdAt: new Date('2026-11-24T00:00:00.000Z'),
    expiresAt: new Date('2026-11-27T00:00:00.000Z'),
    decidedBy: null,
    decidedByName: null,
    decidedAt: null,
    decisionChannel: null,
    decisionNote: null,
    editedPayload: null,
    executedAt: null,
    result: null,
    ...overrides,
  }
}

describe('DecideProposalUseCase (spec tests 4, 5, 33)', () => {
  let entry: EvidenceJournalEntry
  let proposal: Proposal
  let repo: {
    findById: jest.Mock
    claim: jest.Mock
    markRejected: jest.Mock
    markStale: jest.Mock
    markExpired: jest.Mock
    markExecuted: jest.Mock
    markFailed: jest.Mock
  }
  let loaders: { journal_entries: jest.Mock }
  let executeSpy: jest.Mock

  beforeEach(() => {
    entry = makeEntry()
    proposal = makeProposal(entry)
    repo = {
      findById: jest.fn(async () => proposal),
      claim: jest.fn(async (_htx, _id, decision) => {
        if (proposal.status !== 'proposed') return null
        proposal = {
          ...proposal,
          status: 'approved',
          decidedBy: decision.userId,
          decidedByName: decision.userName,
          decidedAt: new Date('2026-11-24T01:00:00.000Z'),
        }
        return proposal
      }),
      markRejected: jest.fn(async () => ({ ...proposal, status: 'rejected' as const })),
      markStale: jest.fn(async () => true),
      markExpired: jest.fn(async () => true),
      markExecuted: jest.fn(async () => undefined),
      markFailed: jest.fn(async () => undefined),
    }
    loaders = { journal_entries: jest.fn(async () => journalEntryValues(entry)) }
    executeSpy = jest.fn(async () => ({ entry_id: entry.id, status: 'REQUEST_CHANGES' }))
  })

  test('forbids farmer without approver role before mutating state', async () => {
    const useCase = new DecideProposalUseCase(repo, loaders, executeSpy)
    await expect(
      useCase.execute({ proposalId: proposal.id, tenant: farmerTenant, userName: 'Farmer', decision: 'approve', channel: 'web' })
    ).rejects.toThrow(ForbiddenError)
    expect(repo.claim).not.toHaveBeenCalled()
    expect(executeSpy).not.toHaveBeenCalled()
  })

  test('executes exactly once when two approvals race', async () => {
    const useCase = new DecideProposalUseCase(repo, loaders, executeSpy)
    const [first, second] = await Promise.all([
      useCase.execute({ proposalId: proposal.id, tenant: officerTenant, userName: 'Cán bộ 1', decision: 'approve', channel: 'web' }),
      useCase.execute({ proposalId: proposal.id, tenant: officerTenant, userName: 'Cán bộ 2', decision: 'approve', channel: 'telegram' }),
    ])

    expect([first.outcome, second.outcome].sort()).toEqual(['already_decided', 'executed'])
    expect(executeSpy).toHaveBeenCalledTimes(1)
  })

  test('marks proposal stale and skips execution when source row changed', async () => {
    loaders.journal_entries.mockResolvedValueOnce(journalEntryValues(makeEntry({ status: 'APPROVED' })))
    const useCase = new DecideProposalUseCase(repo, loaders, executeSpy)

    const outcome = await useCase.execute({
      proposalId: proposal.id,
      tenant: officerTenant,
      userName: 'Cán bộ',
      decision: 'approve',
      channel: 'web',
    })

    expect(outcome).toEqual({ outcome: 'stale' })
    expect(repo.markStale).toHaveBeenCalledTimes(1)
    expect(repo.claim).not.toHaveBeenCalled()
    expect(executeSpy).not.toHaveBeenCalled()
  })

  test('marks proposal expired when expiresAt has passed', async () => {
    const useCase = new DecideProposalUseCase(repo, loaders, executeSpy)
    const outcome = await useCase.execute({
      proposalId: proposal.id,
      tenant: officerTenant,
      userName: 'Cán bộ',
      decision: 'approve',
      channel: 'web',
      now: new Date('2026-11-28T00:00:00.000Z'),
    })

    expect(outcome).toEqual({ outcome: 'expired' })
    expect(repo.markExpired).toHaveBeenCalledTimes(1)
    expect(executeSpy).not.toHaveBeenCalled()
  })

  test('reject requires a non-empty note', async () => {
    const useCase = new DecideProposalUseCase(repo, loaders, executeSpy)
    await expect(
      useCase.execute({ proposalId: proposal.id, tenant: officerTenant, userName: 'Cán bộ', decision: 'reject', note: '   ', channel: 'web' })
    ).rejects.toThrow(ValidationError)
    expect(repo.markRejected).not.toHaveBeenCalled()
  })

  test('rejects edits to non-editable payload fields and applies editable reason_vi', async () => {
    const useCase = new DecideProposalUseCase(repo, loaders, executeSpy)
    await expect(
      useCase.execute({
        proposalId: proposal.id,
        tenant: officerTenant,
        userName: 'Cán bộ',
        decision: 'approve',
        editedPayload: { entry_id: 'other-entry' },
        channel: 'web',
      })
    ).rejects.toThrow(ValidationError)

    const ok = await useCase.execute({
      proposalId: proposal.id,
      tenant: officerTenant,
      userName: 'Cán bộ',
      decision: 'approve',
      editedPayload: { reason_vi: 'Vui lòng ghi rõ 7 ngày cách ly' },
      channel: 'web',
    })
    expect(ok).toEqual({ outcome: 'executed', result: { entry_id: 'entry-1', status: 'REQUEST_CHANGES' } })
    expect(executeSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reason_vi: 'Vui lòng ghi rõ 7 ngày cách ly' }),
      officerTenant
    )
  })

  test('marks failed when execution throws', async () => {
    executeSpy.mockRejectedValueOnce(new Error('DB write error'))
    const useCase = new DecideProposalUseCase(repo, loaders, executeSpy)

    const outcome = await useCase.execute({
      proposalId: proposal.id,
      tenant: officerTenant,
      userName: 'Cán bộ',
      decision: 'approve',
      channel: 'web',
    })

    expect(outcome).toEqual({ outcome: 'failed', error: 'Không thể thực hiện đề xuất. Vui lòng thử lại sau.' })
    expect(repo.markFailed).toHaveBeenCalledWith(
      proposal.id,
      'Không thể thực hiện đề xuất. Vui lòng thử lại sau.',
      expect.objectContaining({ actorId: 'off-1', agent: 'journal-review', kind: 'journal.reject', subjectIds: ['entry-1'] })
    )
  })

  test('stores and shows a domain error message as it is', async () => {
    executeSpy.mockRejectedValueOnce(new DomainError('Chưa qua thời gian cách ly'))
    const useCase = new DecideProposalUseCase(repo, loaders, executeSpy)

    const outcome = await useCase.execute({
      proposalId: proposal.id, tenant: officerTenant, userName: 'Cán bộ', decision: 'approve', channel: 'web',
    })

    expect(outcome).toEqual({ outcome: 'failed', error: 'Chưa qua thời gian cách ly' })
    expect(repo.markFailed).toHaveBeenCalledWith(proposal.id, 'Chưa qua thời gian cách ly', expect.objectContaining({ actorId: 'off-1' }))
  })

  test('answers already decided, not stale, when another decision got there first', async () => {
    loaders.journal_entries.mockResolvedValueOnce(journalEntryValues(makeEntry({ status: 'APPROVED' })))
    repo.markStale.mockResolvedValueOnce(false)
    const useCase = new DecideProposalUseCase(repo, loaders, executeSpy)

    const outcome = await useCase.execute({
      proposalId: proposal.id, tenant: officerTenant, userName: 'Cán bộ', decision: 'approve', channel: 'web',
    })

    expect(outcome.outcome).toBe('already_decided')
    expect(executeSpy).not.toHaveBeenCalled()
  })

  test('still answers executed when recording the execution fails, and logs it', async () => {
    repo.markExecuted.mockRejectedValueOnce(new Error('connection reset'))
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const useCase = new DecideProposalUseCase(repo, loaders, executeSpy)

    const outcome = await useCase.execute({
      proposalId: proposal.id,
      tenant: officerTenant,
      userName: 'Cán bộ',
      decision: 'approve',
      channel: 'web',
    })

    expect(executeSpy).toHaveBeenCalledTimes(1)
    expect(outcome.outcome).toBe('executed')
    expect(repo.markFailed).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('could not record execution'), proposal.id, expect.any(Error))
    errorSpy.mockRestore()
  })
})
