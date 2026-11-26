/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { SETTING_KEYS, agentSettingsUpdateAction } from '@/application/agent/actions/agent-settings-update.action'
import { EVIDENCE_LOADERS } from '@/application/agent/actions/journal-evidence'
import { DecideProposalUseCase } from '@/application/agent/DecideProposalUseCase'
import { canonicalJson, evidenceDigest, sha256Hex } from '@/domain/agent/evidence'
import type { Proposal, EvidenceRow } from '@/domain/agent/proposal'
import type { Tenant } from '@/lib/api/tenant'

const mockApplyKeys = jest.fn()
const mockFindForEvidence = jest.fn()

jest.mock('@/infrastructure/db/agent/PrismaAgentSettingsRepository', () => ({
  PrismaAgentSettingsRepository: jest.fn().mockImplementation(() => ({
    applyKeys: (...args: unknown[]) => mockApplyKeys(...args),
    findForEvidence: (...args: unknown[]) => mockFindForEvidence(...args),
  })),
}))

beforeEach(() => jest.clearAllMocks())

const manager: Tenant = { userId: 'mgr-1', role: 'manager', htxCode: 'TC', htxProfileId: 'htx-tc' }
const action = agentSettingsUpdateAction

function settingsRow(thresholds: Record<string, unknown>, schedule: string | null = null, id = 'TC:field-watch'): EvidenceRow {
  const values = { thresholds, schedule }
  return { table: 'agent_settings', id, sha256: sha256Hex(canonicalJson(values)), values }
}

describe('agent.settings.update payload (contract C2)', () => {
  it('accepts thresholds inside the ranges and a digest schedule', () => {
    expect(action.payloadSchema.safeParse({ agent: 'field-watch', thresholds: { silent_hours: 8 } }).success).toBe(true)
    expect(action.payloadSchema.safeParse({ agent: 'digest', schedule: '07:30' }).success).toBe(true)
  })

  it.each([
    ['a key outside the agent', { agent: 'field-watch', thresholds: { tail_hours: 2 } }],
    ['a value below its range', { agent: 'field-watch', thresholds: { silent_hours: 0 } }],
    ['a value above its range', { agent: 'field-watch', thresholds: { silent_hours: 49 } }],
    ['a schedule before 05:00', { agent: 'digest', schedule: '04:59' }],
    ['a schedule after 22:00', { agent: 'digest', schedule: '23:00' }],
    ['a schedule for a threshold agent', { agent: 'field-watch', schedule: '07:00' }],
    ['thresholds for the digest', { agent: 'digest', thresholds: { silent_hours: 8 } }],
    ['neither thresholds nor schedule', { agent: 'field-watch' }],
    ['an agent outside C2', { agent: 'journal-review', thresholds: { silent_hours: 8 } }],
    ['a key that is not a setting', { agent: 'field-watch', thresholds: { silent_hours: 8 }, autonomy: 'auto' }],
  ])('rejects %s', (_label, payload) => {
    expect(action.payloadSchema.safeParse(payload).success).toBe(false)
  })

  it('exports the keys with their direction for M12', () => {
    expect(SETTING_KEYS['field-watch'].thresholds.silent_hours).toMatchObject({ stricter: 'lower', min: 1, max: 48 })
    expect(SETTING_KEYS['field-watch'].thresholds.dry_soil_pct).toMatchObject({ stricter: 'higher', min: 5, max: 80 })
    expect(SETTING_KEYS.digest.schedule).toMatchObject({ stricter: null, min: '05:00', max: '22:00' })
  })
})

describe('agent.settings.update preview', () => {
  it('marks a loosening and a tightening in the preview', () => {
    const evidence = { rows: [settingsRow({ silent_hours: 6 })], sha256: '' }
    expect(action.preview({ agent: 'field-watch', thresholds: { silent_hours: 8 } }, undefined, evidence)).toEqual([
      'Cảm biến im lặng: 6 → 8 giờ (nới)',
    ])
    expect(action.preview({ agent: 'field-watch', thresholds: { silent_hours: 4 } }, undefined, evidence)).toEqual([
      'Cảm biến im lặng: 6 → 4 giờ (siết)',
    ])
  })

  it('falls back to the default when the cooperative never saved the key', () => {
    expect(action.preview({ agent: 'field-watch', thresholds: { dry_soil_pct: 30 } })).toEqual(['Đất khô: 35% → 30% (nới)'])
  })
})

describe('agent.settings.update execution', () => {
  it('changes only the keys in its payload and returns the old and new values', async () => {
    mockApplyKeys.mockResolvedValueOnce({
      before: { thresholds: { silent_hours: 6, heat_c: 35 }, schedule: null },
      after: { thresholds: { silent_hours: 8, heat_c: 35 }, schedule: null },
    })
    const result = await action.execute({ agent: 'field-watch', thresholds: { silent_hours: 8 } }, manager)
    expect(mockApplyKeys).toHaveBeenCalledWith(
      'TC',
      'field-watch',
      { thresholds: { silent_hours: 8 }, schedule: null },
      'user:mgr-1'
    )
    expect(result).toEqual({
      agent: 'field-watch',
      before: { thresholds: { silent_hours: 6, heat_c: 35 }, schedule: null },
      after: { thresholds: { silent_hours: 8, heat_c: 35 }, schedule: null },
    })
  })
})

describe('agent.settings.update staleness', () => {
  function proposalWith(evidence: { rows: EvidenceRow[]; sha256: string }): Proposal {
    return {
      id: '00000000-0000-0000-0000-000000000009',
      htxCode: 'TC',
      runId: null,
      agent: 'improvement',
      kind: 'agent.settings.update',
      payload: { agent: 'field-watch', thresholds: { silent_hours: 8 } },
      reasonVi: 'r',
      evidence,
      confidence: null,
      risk: 'medium',
      status: 'proposed',
      origin: 'agent',
      requestedBy: null,
      dedupeKey: 'k',
      createdAt: new Date('2026-11-30T00:00:00Z'),
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

  it('settings update is stale after the settings change: deciding changes nothing', async () => {
    const row = settingsRow({ silent_hours: 6 })
    const proposal = proposalWith({ rows: [row], sha256: evidenceDigest([row]) })
    const repo = {
      findById: jest.fn().mockResolvedValue(proposal),
      claim: jest.fn(),
      markRejected: jest.fn(),
      markStale: jest.fn().mockResolvedValue(true),
      markExpired: jest.fn(),
      markExecuted: jest.fn(),
      markFailed: jest.fn(),
    }
    const loaders = {
      ...EVIDENCE_LOADERS,
      agent_settings: async () => ({ thresholds: { silent_hours: 9 }, schedule: null }),
    }
    const outcome = await new DecideProposalUseCase(repo, loaders).execute({
      proposalId: proposal.id,
      tenant: manager,
      userName: 'Quản lý',
      decision: 'approve',
      channel: 'web',
    })
    expect(outcome).toEqual({ outcome: 'stale' })
    expect(repo.markStale).toHaveBeenCalled()
    expect(repo.claim).not.toHaveBeenCalled()
    expect(mockApplyKeys).not.toHaveBeenCalled()
  })

  it('the settings loader answers null for another cooperative without reading the database', async () => {
    expect(await EVIDENCE_LOADERS.agent_settings('HX', 'TC:field-watch')).toBeNull()
    expect(mockFindForEvidence).not.toHaveBeenCalled()
  })
})
