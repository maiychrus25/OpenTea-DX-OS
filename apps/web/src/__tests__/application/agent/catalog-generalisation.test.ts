/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { evidenceDigest } from '@/domain/agent/evidence'
import type { ProposalRepository } from '@/domain/agent/ports/ProposalRepository'
import { ValidationError } from '@/domain/errors'

// Fake actions that exercise the generalised catalogue fields (C1); the real catalogue stays untouched.
const mockFakeActions: Record<string, Record<string, unknown>> = {}

jest.mock('@/application/agent/action-catalog', () => ({
  getAction: (kind: string) => mockFakeActions[kind],
}))

import { CreateProposalUseCase } from '@/application/agent/CreateProposalUseCase'

function fakeAction(overrides: Record<string, unknown>) {
  return {
    kind: 'test.action',
    risk: 'low',
    origins: ['agent'],
    approverRoles: ['manager'],
    autonomy: 'auto',
    channels: ['web'],
    payloadSchema: z.object({ subjects: z.array(z.string()), note_vi: z.string().optional() }).strict(),
    editableFields: [],
    humanOnlyFields: [],
    subjectTable: null,
    repeatAfterHours: null,
    expiresAfterHours: 24,
    preview: () => [],
    subjects: (payload: { subjects: string[] }) => payload.subjects,
    isStale: async () => false,
    execute: async () => ({}),
    ...overrides,
  }
}

function makeRepo(createdSince = false): jest.Mocked<Pick<ProposalRepository, 'create' | 'createdSince'>> {
  return {
    create: jest.fn().mockResolvedValue({ id: 'prop-1' }),
    createdSince: jest.fn().mockResolvedValue(createdSince),
  }
}

const parcelRows = [{ table: 'parcels', id: 'P-TC-001', sha256: 'h1' }]
const noLoaders = {}

function evidenceOf(rows: { table: string; id: string; sha256: string }[]) {
  return { rows, sha256: evidenceDigest(rows) }
}

describe('catalogue generalisation (C1)', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockFakeActions)) delete mockFakeActions[key]
  })

  test('subject check uses the action subjectTable: refused without a parcels row', async () => {
    mockFakeActions['test.parcel'] = fakeAction({ kind: 'test.parcel', subjectTable: 'parcels' })
    const repo = makeRepo()
    const useCase = new CreateProposalUseCase(repo, { parcels: async () => ({ id: 'P-TC-001' }) })

    const rows: { table: string; id: string; sha256: string }[] = []
    await expect(
      useCase.execute({
        htxCode: 'TC',
        agent: 'field-watch',
        kind: 'test.parcel',
        payload: { subjects: ['P-TC-001'] },
        reasonVi: 'Thử nghiệm',
        evidence: evidenceOf(rows),
        origin: 'agent',
      })
    ).rejects.toThrow('SUBJECT_NOT_IN_EVIDENCE')
    expect(repo.create).not.toHaveBeenCalled()
  })

  test('subject check uses the action subjectTable: accepted with a matching parcels row', async () => {
    mockFakeActions['test.parcel'] = fakeAction({ kind: 'test.parcel', subjectTable: 'parcels' })
    const repo = makeRepo()
    const useCase = new CreateProposalUseCase(repo, { parcels: async () => ({ id: 'P-TC-001' }) })

    await expect(
      useCase.execute({
        htxCode: 'TC',
        agent: 'field-watch',
        kind: 'test.parcel',
        payload: { subjects: ['P-TC-001'] },
        reasonVi: 'Thử nghiệm',
        evidence: evidenceOf(parcelRows),
        origin: 'agent',
      })
    ).resolves.toEqual({ id: 'prop-1' })
  })

  test('null subjectTable skips the subject check', async () => {
    mockFakeActions['test.plain'] = fakeAction({ kind: 'test.plain', subjectTable: null })
    const repo = makeRepo()
    const useCase = new CreateProposalUseCase(repo, noLoaders)

    await expect(
      useCase.execute({
        htxCode: 'TC',
        agent: 'field-watch',
        kind: 'test.plain',
        payload: { subjects: ['dry_soil:2026-11-25'] },
        reasonVi: 'Thử nghiệm',
        evidence: evidenceOf([]),
        origin: 'agent',
      })
    ).resolves.toEqual({ id: 'prop-1' })
  })

  test('agent payload with a human-only field is refused', async () => {
    mockFakeActions['test.human'] = fakeAction({
      kind: 'test.human',
      payloadSchema: z.object({ subjects: z.array(z.string()), note_vi: z.string().optional() }).strict(),
      editableFields: ['note_vi'],
      humanOnlyFields: ['note_vi'],
    })
    const repo = makeRepo()
    const useCase = new CreateProposalUseCase(repo, noLoaders)

    await expect(
      useCase.execute({
        htxCode: 'TC',
        agent: 'field-watch',
        kind: 'test.human',
        payload: { subjects: ['a'], note_vi: 'Lời nhắn của agent' },
        reasonVi: 'Thử nghiệm',
        evidence: evidenceOf([]),
        origin: 'agent',
      })
    ).rejects.toThrow('INVALID_PAYLOAD')
    expect(repo.create).not.toHaveBeenCalled()
  })

  test('repeat window dedupes a proposal decided an hour ago', async () => {
    mockFakeActions['test.repeat'] = fakeAction({ kind: 'test.repeat', repeatAfterHours: 24 })
    const repo = makeRepo(true)
    const useCase = new CreateProposalUseCase(repo, noLoaders)
    const now = new Date('2026-11-25T03:00:00.000Z')

    const res = await useCase.execute({
      htxCode: 'TC',
      agent: 'field-watch',
      kind: 'test.repeat',
      payload: { subjects: ['dry_soil:2026-11-25'] },
      reasonVi: 'Thử nghiệm',
      evidence: evidenceOf([]),
      origin: 'agent',
      now,
    })

    expect(res).toBeNull()
    expect(repo.createdSince).toHaveBeenCalledWith(
      'TC',
      'test.repeat:["dry_soil:2026-11-25"]',
      new Date('2026-11-24T03:00:00.000Z')
    )
    expect(repo.create).not.toHaveBeenCalled()
  })

  test('without a repeat window the repository is not asked', async () => {
    mockFakeActions['test.once'] = fakeAction({ kind: 'test.once', repeatAfterHours: null })
    const repo = makeRepo(true)
    const useCase = new CreateProposalUseCase(repo, noLoaders)

    await expect(
      useCase.execute({
        htxCode: 'TC',
        agent: 'field-watch',
        kind: 'test.once',
        payload: { subjects: ['a'] },
        reasonVi: 'Thử nghiệm',
        evidence: evidenceOf([]),
        origin: 'agent',
      })
    ).resolves.toEqual({ id: 'prop-1' })
    expect(repo.createdSince).not.toHaveBeenCalled()
  })
})
