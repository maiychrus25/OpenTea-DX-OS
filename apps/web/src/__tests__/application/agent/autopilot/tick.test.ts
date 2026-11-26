/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Side effects of the harvest action are replaced by recording fakes; the decision and the tick run for real.
jest.mock('@/infrastructure/db/notification/prisma-notification-repository', () => ({ PrismaNotificationRepository: jest.fn() }))
jest.mock('@/infrastructure/db/farm/PrismaParcelRepository', () => ({ PrismaParcelRepository: jest.fn() }))
jest.mock('@/infrastructure/db/journal/PrismaJournalRepository', () => ({ PrismaJournalRepository: jest.fn() }))
jest.mock('@/lib/api/tenant-guard', () => ({ TenantGuard: jest.fn(() => ({ parcel: jest.fn(async () => undefined) })) }))
jest.mock('@/application/farm/approve-harvest-usecase', () => {
  const approve = jest.fn(async () => ({ id: 'parcel-1', status: 'HARVEST_APPROVED' }))
  return { ApproveHarvestUseCase: jest.fn(() => ({ execute: approve })), __approve: approve }
})

import { DecideProposalUseCase } from '@/application/agent/DecideProposalUseCase'
import { RunAutopilotTickUseCase, type RunAutopilotTickDeps } from '@/application/agent/autopilot/RunAutopilotTickUseCase'
import { evidenceDigest } from '@/domain/agent/evidence'
import { disabledConfig, type AutopilotConfig, type StopReason } from '@/domain/agent/autopilot'
import type { AutopilotRepository } from '@/domain/agent/ports/AutopilotRepository'
import type { Proposal } from '@/domain/agent/proposal'
import { DomainError } from '@/domain/errors/DomainError'

const approveHarvest = jest.requireMock('@/application/farm/approve-harvest-usecase').__approve

const NOW = new Date('2026-11-27T05:00:00.000Z') // 12:00 in Vietnam
const HTX = 'TC'

interface Row {
  proposal: Proposal
  claimed: boolean
}

/** In-memory twin of the repository's window rules: claim, block, stop and clear behave as the SQL does. */
class FakeAutopilot implements AutopilotRepository {
  config: AutopilotConfig = {
    ...disabledConfig(HTX),
    enabled: true,
    enabledBy: 'mgr-1',
    enabledByName: 'Lan',
    enabledAt: new Date(NOW.getTime() - 3_600_000),
    lastManagerActivityAt: new Date(NOW.getTime() - 60_000),
    dailyCap: 50,
  }
  rows = new Map<string, Row>()
  counts = { autoRuns: 0, blocked: 0, failuresLastHour: 0 }
  spike: string | null = null
  householdCounts = new Map<string, number>()
  householdsOf = ['hh-1']
  claimedLimit: number | null = null
  stops: { reason: StopReason; by: string | null }[] = []

  add(over: Partial<Proposal> = {}, runAt: Date | null = new Date(NOW.getTime() - 1000)): string {
    const id = `00000000-0000-4000-8000-${String(this.rows.size + 1).padStart(12, '0')}`
    const proposal = makeProposal({ id, runAt, ...over })
    this.rows.set(id, { proposal, claimed: false })
    return id
  }
  async get() { return this.config }
  async enable() {}
  async stop(_htx: string, reason: StopReason, by: string | null) {
    if (!this.config.enabled) return null
    this.config = { ...this.config, enabled: false, stopReason: reason }
    this.stops.push({ reason, by })
    let returned = 0
    for (const row of Array.from(this.rows.values())) {
      if (row.proposal.status === 'proposed' && (row.proposal.runAt || row.claimed)) {
        row.proposal.runAt = null
        row.claimed = false
        returned++
      }
    }
    return { returned }
  }
  async touchManagerActivity() {}
  async claimDue(_htx: string, limit: number) {
    this.claimedLimit = limit
    const due = Array.from(this.rows.values())
      .filter((r) => r.proposal.status === 'proposed' && r.proposal.runAt && r.proposal.runAt <= NOW && !r.claimed)
      .slice(0, limit)
    due.forEach((r) => (r.claimed = true))
    return due.map((r) => ({ id: r.proposal.id, agent: r.proposal.agent, kind: r.proposal.kind }))
  }
  async clearWindow(_htx: string, id: string) {
    const row = this.rows.get(id)!
    row.proposal.runAt = null
    row.claimed = false
  }
  async block(_htx: string, id: string, userId: string) {
    const row = this.rows.get(id)
    if (!row) return 'not_found' as const
    if (row.proposal.status !== 'proposed' || row.claimed) return 'already_ran' as const
    if (!row.proposal.runAt) return 'not_scheduled' as const
    row.proposal.runAt = null
    row.proposal.blockedBy = userId
    return 'blocked' as const
  }
  async dayCounts() { return this.counts }
  async countPending() { return 0 }
  async volumeSpike() { return this.spike }
  async matchRates() { return [] }
  async householdMessageCounts() { return this.householdCounts }
  async householdsOfParcels() { return this.householdsOf }
  async daySummary() { return { wasOn: true, ran: 0, blocked: 0, brakes: 0, costUsd: 0 } }
}

function makeProposal(over: Partial<Proposal> = {}): Proposal {
  return {
    id: 'p',
    htxCode: HTX,
    runId: null,
    agent: 'field-watch',
    kind: 'notification.internal',
    payload: {},
    reasonVi: 'x',
    evidence: { rows: [], sha256: evidenceDigest([]) },
    confidence: null,
    risk: 'low',
    status: 'proposed',
    origin: 'agent',
    requestedBy: null,
    dedupeKey: 'k',
    createdAt: new Date(NOW.getTime() - 3_600_000),
    expiresAt: new Date(NOW.getTime() + 3_600_000),
    decidedBy: null,
    decidedByName: null,
    decidedAt: null,
    decisionChannel: null,
    decisionNote: null,
    editedPayload: null,
    executedAt: null,
    result: null,
    ...over,
  }
}

function setup(roles: { roles: string[]; enabled: boolean; htxCode: string | null } | null | Error = { roles: ['manager'], enabled: true, htxCode: HTX }) {
  const fake = new FakeAutopilot()
  const decide = jest.fn<ReturnType<RunAutopilotTickDeps['decide']>, Parameters<RunAutopilotTickDeps['decide']>>(async () => ({
    outcome: 'executed',
    result: {},
  }))
  const notifier = { stopped: jest.fn(async () => undefined), decided: jest.fn(async () => undefined) }
  const readRole = jest.fn(async () => {
    if (roles instanceof Error) throw roles
    return roles
  })
  const tick = new RunAutopilotTickUseCase({
    autopilot: fake,
    proposals: { findById: async (_h, id) => fake.rows.get(id)?.proposal ?? null },
    decide,
    roles: { read: readRole },
    htxProfileId: async () => 'htx-tc',
    notifier,
    now: () => NOW,
  })
  return { fake, decide, notifier, tick, readRole }
}

describe('RunAutopilotTickUseCase', () => {
  test('a cooperative with the mode off is left alone', async () => {
    const { fake, tick, decide, readRole } = setup()
    fake.config = { ...fake.config, enabled: false }
    fake.add()
    expect(await tick.execute(HTX)).toEqual({ ran: 0, failed: 0, returned: 0, stopped: null })
    expect(readRole).not.toHaveBeenCalled()
    expect(decide).not.toHaveBeenCalled()
  })

  test('runs a due proposal as the enabling manager with channel autopilot, and tells the notifier', async () => {
    const { fake, tick, decide, notifier } = setup()
    const id = fake.add()
    expect(await tick.execute(HTX)).toEqual({ ran: 1, failed: 0, returned: 0, stopped: null })
    expect(decide).toHaveBeenCalledWith({
      proposalId: id,
      tenant: { userId: 'mgr-1', role: 'manager', htxCode: HTX, htxProfileId: 'htx-tc' },
      userName: 'AI tự thực hiện (bật bởi Lan)',
      decision: 'approve',
      channel: 'autopilot',
      now: NOW,
    })
    expect(notifier.decided).toHaveBeenCalledWith(HTX, id)
  })

  test('a window that has not ended is not run', async () => {
    const { fake, tick, decide } = setup()
    fake.add({}, new Date(NOW.getTime() + 600_000))
    expect((await tick.execute(HTX)).ran).toBe(0)
    expect(decide).not.toHaveBeenCalled()
  })

  test('tick never runs a blocked or stopped proposal', async () => {
    const { fake, tick, decide } = setup()
    const blocked = fake.add({ kind: 'journal.reject', risk: 'medium' })
    fake.add({ kind: 'journal.reject', risk: 'medium' })
    expect(await fake.block(HTX, blocked, 'off-1')).toBe('blocked')
    const result = await tick.execute(HTX)
    expect(result.ran).toBe(1)
    expect(decide.mock.calls.map((c) => c[0].proposalId)).not.toContain(blocked)

    const second = setup()
    second.fake.add()
    await second.fake.stop(HTX, 'manual', 'mgr-1')
    second.fake.config = { ...second.fake.config, enabled: true } // even if the mode comes back, the window was cleared
    expect((await second.tick.execute(HTX)).ran).toBe(0)
    expect(second.decide).not.toHaveBeenCalled()
  })

  test('a stop that lands after the claim wins: the proposal goes back to normal', async () => {
    const { fake, tick, decide } = setup()
    const id = fake.add()
    const original = fake.claimDue.bind(fake)
    fake.claimDue = async (htx: string, limit: number) => {
      const due = await original(htx, limit)
      fake.config = { ...fake.config, enabled: false }
      return due
    }
    const result = await tick.execute(HTX)
    expect(result).toMatchObject({ ran: 0, returned: 1 })
    expect(decide).not.toHaveBeenCalled()
    expect(fake.rows.get(id)!.proposal.runAt).toBeNull()
  })

  describe('auto-stop', () => {
    test.each([
      ['the enabler lost the manager role', { roles: ['officer'], enabled: true, htxCode: HTX }],
      ['the enabler is disabled', { roles: ['manager'], enabled: false, htxCode: HTX }],
      ['the enabler moved to another cooperative', { roles: ['manager'], enabled: true, htxCode: 'OTHER' }],
      ['the enabler no longer exists', null],
    ])('%s: stops with enabler_lost, returns windows, tells people, runs nothing', async (_name, roles) => {
      const { fake, tick, decide, notifier } = setup(roles)
      const id = fake.add()
      const result = await tick.execute(HTX)
      expect(result).toEqual({ ran: 0, failed: 0, returned: 1, stopped: 'enabler_lost' })
      expect(fake.rows.get(id)!.proposal.runAt).toBeNull()
      expect(fake.config.enabled).toBe(false)
      expect(decide).not.toHaveBeenCalled()
      expect(notifier.stopped).toHaveBeenCalledWith(HTX, 'enabler_lost', 1, 50)
    })

    test('an unreadable role skips the tick without stopping or running', async () => {
      const { fake, tick, decide } = setup(new Error('keycloak down'))
      fake.add()
      jest.spyOn(console, 'error').mockImplementation(() => undefined)
      expect(await tick.execute(HTX)).toEqual({ ran: 0, failed: 0, returned: 0, stopped: null })
      expect(fake.config.enabled).toBe(true)
      expect(decide).not.toHaveBeenCalled()
    })

    test('seven days without a manager stops it; six does not', async () => {
      const stale = setup()
      stale.fake.config = { ...stale.fake.config, lastManagerActivityAt: new Date(NOW.getTime() - 7 * 86_400_000 - 1000) }
      expect((await stale.tick.execute(HTX)).stopped).toBe('inactive')

      const fresh = setup()
      fresh.fake.config = { ...fresh.fake.config, lastManagerActivityAt: new Date(NOW.getTime() - 6 * 86_400_000) }
      expect((await fresh.tick.execute(HTX)).stopped).toBeNull()
    })

    test('a mode never touched since it was enabled counts from the enabling time', async () => {
      const { fake, tick } = setup()
      fake.config = { ...fake.config, lastManagerActivityAt: null, enabledAt: new Date(NOW.getTime() - 8 * 86_400_000) }
      expect((await tick.execute(HTX)).stopped).toBe('inactive')
    })
  })

  describe('brakes', () => {
    test.each([
      ['three failures in the last hour', { autoRuns: 3, blocked: 0, failuresLastHour: 3 }, 'brake_failures'],
      ['the daily cap reached', { autoRuns: 50, blocked: 0, failuresLastHour: 0 }, 'brake_cap'],
      ['more than 30% blocked of at least five', { autoRuns: 3, blocked: 2, failuresLastHour: 0 }, 'brake_blocks'],
    ])('%s stops the mode', async (_name, counts, reason) => {
      const { fake, tick, decide, notifier } = setup()
      fake.counts = counts
      fake.add()
      const result = await tick.execute(HTX)
      expect(result.stopped).toBe(reason)
      expect(result.returned).toBe(1)
      expect(decide).not.toHaveBeenCalled()
      expect(notifier.stopped).toHaveBeenCalledWith(HTX, reason, 1, 50)
    })

    test('two failures, 49 runs, 30% blocked or fewer than five decided do not brake', async () => {
      for (const counts of [
        { autoRuns: 5, blocked: 0, failuresLastHour: 2 },
        { autoRuns: 49, blocked: 0, failuresLastHour: 0 },
        { autoRuns: 7, blocked: 3, failuresLastHour: 0 }, // exactly 30%
        { autoRuns: 2, blocked: 2, failuresLastHour: 0 }, // 4 decided
      ]) {
        const { fake, tick } = setup()
        fake.counts = counts
        expect((await tick.execute(HTX)).stopped).toBeNull()
      }
    })

    test('a volume spike of one agent stops the mode', async () => {
      const { fake, tick } = setup()
      fake.spike = 'field-watch'
      expect((await tick.execute(HTX)).stopped).toBe('brake_volume')
    })

    test('the claim never exceeds the room left under the daily cap, nor 20', async () => {
      const { fake, tick } = setup()
      fake.counts = { autoRuns: 45, blocked: 0, failuresLastHour: 0 }
      await tick.execute(HTX)
      expect(fake.claimedLimit).toBe(5)
      const other = setup()
      await other.tick.execute(HTX)
      expect(other.fake.claimedLimit).toBe(20)
    })
  })

  describe('outcomes', () => {
    test('a failed or stale outcome counts as a failure; expired goes back to a person', async () => {
      const { fake, tick, decide } = setup()
      fake.add()
      fake.add()
      fake.add()
      decide
        .mockResolvedValueOnce({ outcome: 'failed', error: 'x' })
        .mockResolvedValueOnce({ outcome: 'stale' })
        .mockResolvedValueOnce({ outcome: 'expired' })
      expect(await tick.execute(HTX)).toEqual({ ran: 0, failed: 2, returned: 1, stopped: null })
    })

    test('a proposal someone else decided first is neither a run nor a failure', async () => {
      const { fake, tick, decide, notifier } = setup()
      fake.add()
      decide.mockResolvedValueOnce({ outcome: 'already_decided', by: 'Lan', at: NOW, status: 'executed' })
      expect(await tick.execute(HTX)).toEqual({ ran: 0, failed: 0, returned: 0, stopped: null })
      expect(notifier.decided).not.toHaveBeenCalled()
    })

    test('a decision refused with a domain error returns the proposal to normal approval', async () => {
      const { fake, tick, decide } = setup()
      const id = fake.add()
      decide.mockRejectedValueOnce(new DomainError('Bạn không có quyền'))
      expect((await tick.execute(HTX)).failed).toBe(1)
      expect(fake.rows.get(id)!.proposal.runAt).toBeNull()
    })

    test('a proposal that stopped being eligible is given back, not run', async () => {
      const { fake, tick, decide } = setup()
      const user = fake.add({ origin: 'user' })
      const unlockable = fake.add({ kind: 'journal.approve', payload: { entry_ids: ['e'] } }) // not unlocked
      expect(await tick.execute(HTX)).toMatchObject({ ran: 0, returned: 2 })
      expect(decide).not.toHaveBeenCalled()
      expect(fake.rows.get(user)!.proposal.runAt).toBeNull()
      expect(fake.rows.get(unlockable)!.proposal.runAt).toBeNull()
    })

    test('an unlocked kind still runs', async () => {
      const { fake, tick, decide } = setup()
      fake.config = { ...fake.config, unlockedKinds: ['journal.approve'] }
      fake.add({ kind: 'journal.approve', payload: { entry_ids: ['e'] } })
      expect((await tick.execute(HTX)).ran).toBe(1)
      expect(decide).toHaveBeenCalledTimes(1)
    })
  })

  describe('household message cap', () => {
    const households = { kind: 'notification.households', risk: 'medium' as const, payload: { slots: { parcel_codes: ['P1'] } } }

    test('a household at two automatic messages today holds the proposal back for a person', async () => {
      const { fake, tick, decide } = setup()
      fake.householdCounts = new Map([['hh-1', 2]])
      const id = fake.add(households)
      expect(await tick.execute(HTX)).toMatchObject({ ran: 0, returned: 1 })
      expect(decide).not.toHaveBeenCalled()
      expect(fake.rows.get(id)!.proposal).toMatchObject({ status: 'proposed', runAt: null })
    })

    test('a message to households ends with the line that says an AI sent it', async () => {
      const { fake, tick, decide } = setup()
      fake.add(households)
      fake.add()
      await tick.execute(HTX)
      const byKind = Object.fromEntries(decide.mock.calls.map((c) => [fake.rows.get(c[0].proposalId)!.proposal.kind, c[0]]))
      expect(byKind['notification.households'].editedPayload).toEqual({ note_vi: '(Tin do AI của HTX gửi)' })
      expect(byKind['notification.internal'].editedPayload).toBeUndefined()
    })

    test('the households template puts the suffix at the end of the body', async () => {
      const { renderNotification } = await import('@/application/agent/actions/message-templates')
      const payload = { template: 'dry_soil', slots: { parcel_codes: ['P1'], value_pct: 20, threshold_pct: 35 } }
      const body = renderNotification(payload.template, payload.slots, '(Tin do AI của HTX gửi)').body
      expect(body.endsWith('\n\n(Tin do AI của HTX gửi)')).toBe(true)
    })

    test('one message under the cap still runs', async () => {
      const { fake, tick } = setup()
      fake.householdCounts = new Map([['hh-1', 1]])
      fake.add(households)
      expect((await tick.execute(HTX)).ran).toBe(1)
    })
  })
})

describe('the tick through the real DecideProposalUseCase', () => {
  function realDecide(fake: FakeAutopilot) {
    const repo = {
      findById: jest.fn(async (_h: string, id: string) => fake.rows.get(id)?.proposal ?? null),
      claim: jest.fn(async (_h: string, id: string) => fake.rows.get(id)!.proposal),
      markRejected: jest.fn(),
      markStale: jest.fn(async () => true),
      markExpired: jest.fn(async () => true),
      markExecuted: jest.fn(async () => undefined),
      markFailed: jest.fn(async () => undefined),
    }
    return { repo, useCase: new DecideProposalUseCase(repo as never) }
  }

  function tickWith(fake: FakeAutopilot, useCase: DecideProposalUseCase) {
    return new RunAutopilotTickUseCase({
      autopilot: fake,
      proposals: { findById: async (_h, id) => fake.rows.get(id)?.proposal ?? null },
      decide: (input) => useCase.execute(input),
      roles: { read: async () => ({ roles: ['manager'], enabled: true, htxCode: HTX }) },
      htxProfileId: async () => 'htx-tc',
      notifier: { stopped: async () => undefined, decided: async () => undefined },
      now: () => NOW,
    })
  }

  test('an auto-run is audited as autopilot:<agent> with who enabled the mode (test 24)', async () => {
    const fake = new FakeAutopilot()
    fake.add({ agent: 'harvest-ready', kind: 'harvest.approve', risk: 'high', payload: { parcel_id: 'parcel-1' } })
    fake.config = { ...fake.config, unlockedKinds: ['harvest.approve'] }
    const { repo, useCase } = realDecide(fake)
    expect(await tickWith(fake, useCase).execute(HTX)).toMatchObject({ ran: 1 })
    const autopilot = { actor: 'autopilot:harvest-ready', enabledBy: 'mgr-1' }
    expect(repo.claim).toHaveBeenCalledWith(
      HTX,
      expect.any(String),
      expect.objectContaining({ userId: 'mgr-1', channel: 'autopilot', role: 'manager', autopilot })
    )
    expect(repo.markExecuted).toHaveBeenCalledWith(expect.any(String), expect.anything(), expect.objectContaining({ autopilot }))
  })

  test('a harvest in its withdrawal period is refused by the use case and not executed (test 23)', async () => {
    const fake = new FakeAutopilot()
    fake.add({ agent: 'harvest-ready', kind: 'harvest.approve', risk: 'high', payload: { parcel_id: 'parcel-1' } })
    fake.config = { ...fake.config, unlockedKinds: ['harvest.approve'] }
    approveHarvest.mockRejectedValueOnce(new DomainError('Chưa qua thời gian cách ly. An toàn thu hoạch từ ngày 28/11/2026'))
    const { repo, useCase } = realDecide(fake)
    const result = await tickWith(fake, useCase).execute(HTX)
    expect(result).toMatchObject({ ran: 0, failed: 1 })
    expect(repo.markFailed).toHaveBeenCalledWith(
      expect.any(String),
      'Chưa qua thời gian cách ly. An toàn thu hoạch từ ngày 28/11/2026',
      expect.objectContaining({ autopilot: { actor: 'autopilot:harvest-ready', enabledBy: 'mgr-1' } })
    )
    expect(repo.markExecuted).not.toHaveBeenCalled()
  })

  test('a stale outcome is marked stale by autopilot and counted as a failure', async () => {
    const fake = new FakeAutopilot()
    // Evidence of a table the loaders do not know is stale by the real check.
    fake.add({
      agent: 'journal-review',
      kind: 'journal.reject',
      risk: 'medium',
      payload: { entry_id: 'e1', decision: 'REQUEST_CHANGES', reason_code: 'WITHDRAWAL_PERIOD', reason_vi: 'Thiếu số ngày cách ly chuẩn 7 ngày' },
    })
    const { repo } = realDecide(fake)
    const stale = new DecideProposalUseCase(repo as never, {} as never)
    const rows = [{ table: 'journal_entries', id: 'e1', sha256: 'old' }]
    fake.rows.forEach((r) => (r.proposal.evidence = { rows, sha256: evidenceDigest(rows) }))
    const result = await tickWith(fake, stale).execute(HTX)
    expect(result.failed).toBe(1)
    expect(repo.markStale).toHaveBeenCalledWith(HTX, expect.any(String), expect.objectContaining({ autopilot: expect.objectContaining({ actor: 'autopilot:journal-review' }) }))
  })
})
