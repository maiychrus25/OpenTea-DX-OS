/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Test 39 of the M14 plan: the public lot page shows the verification line only for an intact, matching AI decision.
import { LotAiVerification } from '@/application/lot/lot-ai-verification'
import type { HarvestDecision, LotVerificationRepository } from '@/domain/repositories/lot-verification-repository'

// 30 Nov 2026 17:00 UTC is 1 Dec 2026 in Vietnam.
const DECIDED_AT = new Date('2026-11-30T17:00:00Z')

function decision(overrides: Partial<HarvestDecision> = {}): HarvestDecision {
  return {
    proposalId: 'proposal-1',
    proposalEvidenceSha256: 'hash-a',
    eventId: '101',
    eventEvidenceSha256: 'hash-a',
    role: 'manager',
    decidedAt: DECIDED_AT,
    ...overrides,
  }
}

function repo(decisions: HarvestDecision[], intact = true): LotVerificationRepository & { chainChecks: string[] } {
  const chainChecks: string[] = []
  return {
    chainChecks,
    findHarvestDecisions: async () => decisions,
    auditChainIntactThrough: async (eventId: string) => {
      chainChecks.push(eventId)
      return intact
    },
  }
}

const LINE = 'AI đề xuất, trưởng HTX đã duyệt ngày 01/12/2026, kiểm chứng trong sổ audit'

describe('LotAiVerification (test 39)', () => {
  it('shows one line for an executed harvest decision with an intact chain and a matching hash', async () => {
    expect(await new LotAiVerification(repo([decision()])).execute('TC-CHE-1')).toEqual([LINE])
  })

  it('shows no line when the audit chain is broken before the decision', async () => {
    expect(await new LotAiVerification(repo([decision()], false)).execute('TC-CHE-1')).toEqual([])
  })

  it('shows no line when the evidence hash of the decision differs from the proposal', async () => {
    const mismatch = decision({ eventEvidenceSha256: 'hash-b' })
    expect(await new LotAiVerification(repo([mismatch])).execute('TC-CHE-1')).toEqual([])
  })

  it('shows no line when the decision event has no evidence hash', async () => {
    const missing = decision({ eventEvidenceSha256: null })
    expect(await new LotAiVerification(repo([missing])).execute('TC-CHE-1')).toEqual([])
  })

  it('shows no line when the lot has no AI decision', async () => {
    const check = repo([])
    expect(await new LotAiVerification(check).execute('TC-CHE-1')).toEqual([])
    expect(check.chainChecks).toEqual([])
  })

  it('words an officer decision as cán bộ', async () => {
    const lines = await new LotAiVerification(repo([decision({ role: 'officer' })])).execute('TC-CHE-1')
    expect(lines).toEqual(['AI đề xuất, cán bộ đã duyệt ngày 01/12/2026, kiểm chứng trong sổ audit'])
  })

  it('shows no line for a role it does not know', async () => {
    expect(await new LotAiVerification(repo([decision({ role: 'farmer' })])).execute('TC-CHE-1')).toEqual([])
  })

  it('shows one line per distinct decision, at most three, and never a name', async () => {
    const decisions = [1, 2, 3, 4].map((n) =>
      decision({ proposalId: `proposal-${n}`, eventId: String(100 + n), decidedAt: DECIDED_AT })
    )
    const lines = await new LotAiVerification(repo([...decisions, decisions[0]])).execute('TC-CHE-1')
    expect(lines).toHaveLength(3)
    for (const line of lines) expect(line).toBe(LINE)
    expect(lines.join(' ')).not.toMatch(/user|mgr|maiychrus/i)
  })
})
