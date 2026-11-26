// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { getAction } from '@/application/agent/action-catalog'
import { vnDayOf, vnDayStart } from '@/application/agent/campaign/vn-day'
import type { DecideProposalInput, DecideProposalOutcome } from '@/application/agent/DecideProposalUseCase'
import type { AutopilotConfig, StopReason } from '@/domain/agent/autopilot'
import { HOUSEHOLD_DAILY_MESSAGE_CAP } from '@/domain/agent/autopilot'
import type { AutopilotRepository } from '@/domain/agent/ports/AutopilotRepository'
import type { ProposalRepository } from '@/domain/agent/ports/ProposalRepository'
import { DomainError } from '@/domain/errors'
import type { LiveRoleReader } from '@/domain/telegram/ports/LiveRoleReader'
import { autoEligibility } from './eligibility'

const DAY_MS = 24 * 60 * 60_000
export const INACTIVITY_LIMIT_MS = 7 * DAY_MS
export const MAX_RUNS_PER_TICK = 20
const FAILURE_BRAKE = 3
const BLOCK_SHARE_BRAKE = 0.3
const BLOCK_BRAKE_MIN_DECIDED = 5

export interface TickResult {
  ran: number
  failed: number
  returned: number
  stopped: StopReason | null
}

/** What the tick tells people: the stop message to every manager and officer, and the edit of a proposal's message after a run. */
export interface AutopilotTickNotifier {
  stopped(htxCode: string, reason: StopReason, returned: number, dailyCap: number): Promise<void>
  decided(htxCode: string, proposalId: string): Promise<void>
}

export interface RunAutopilotTickDeps {
  autopilot: AutopilotRepository
  proposals: Pick<ProposalRepository, 'findById'>
  decide(input: DecideProposalInput): Promise<DecideProposalOutcome>
  roles: LiveRoleReader
  htxProfileId(htxCode: string): Promise<string | null>
  notifier: AutopilotTickNotifier
  now?: () => Date
}

/**
 * The once-a-minute pass for one cooperative: stop when a condition fails, brake on anomalies, then run the proposals
 * whose window has ended through the same decision use case as a person (spec §11). Re-checks everything at run time.
 */
export class RunAutopilotTickUseCase {
  private readonly now: () => Date

  constructor(private readonly deps: RunAutopilotTickDeps) {
    this.now = deps.now ?? (() => new Date())
  }

  async execute(htxCode: string): Promise<TickResult> {
    const result: TickResult = { ran: 0, failed: 0, returned: 0, stopped: null }
    const config = await this.deps.autopilot.get(htxCode)
    if (!config.enabled || !config.enabledBy) return result

    const stopReason = (await this.autoStopReason(config)) ?? (await this.brakeReason(config))
    if (stopReason === 'skip') return result
    if (stopReason) {
      await this.stop(config, stopReason, result)
      return result
    }

    const htxProfileId = await this.deps.htxProfileId(htxCode)
    if (!htxProfileId) return result
    const dayStart = vnDayStart(vnDayOf(this.now()))
    const counts = await this.deps.autopilot.dayCounts(htxCode, dayStart, this.now())
    const room = Math.max(0, config.dailyCap - counts.autoRuns)
    const due = await this.deps.autopilot.claimDue(htxCode, Math.min(MAX_RUNS_PER_TICK, room))

    for (const item of due) {
      // A stop or a block that landed after the claim wins: the live config is read before every run.
      const live = await this.deps.autopilot.get(htxCode)
      if (!live.enabled || !live.enabledBy) {
        await this.deps.autopilot.clearWindow(htxCode, item.id)
        result.returned++
        continue
      }
      const outcome = await this.runOne(live, htxProfileId, item.id, dayStart)
      if (outcome === 'ran') result.ran++
      else if (outcome === 'failed') result.failed++
      else if (outcome === 'returned') result.returned++
    }
    return result
  }

  /** `enabler_lost` or `inactive`; `skip` when the live role could not be read (nothing runs, nothing stops). */
  private async autoStopReason(config: AutopilotConfig): Promise<StopReason | 'skip' | null> {
    let live
    try {
      live = await this.deps.roles.read(config.enabledBy!)
    } catch (err) {
      console.error('[AutopilotTick] could not read the enabler role; skipping this tick', err)
      return 'skip'
    }
    if (!live || !live.enabled || live.htxCode !== config.htxCode || !live.roles.includes('manager')) return 'enabler_lost'
    const lastSeen = config.lastManagerActivityAt ?? config.enabledAt
    if (lastSeen && this.now().getTime() - lastSeen.getTime() > INACTIVITY_LIMIT_MS) return 'inactive'
    return null
  }

  private async brakeReason(config: AutopilotConfig): Promise<StopReason | null> {
    const now = this.now()
    const dayStart = vnDayStart(vnDayOf(now))
    const counts = await this.deps.autopilot.dayCounts(config.htxCode, dayStart, now)
    if (counts.failuresLastHour >= FAILURE_BRAKE) return 'brake_failures'
    if (counts.autoRuns >= config.dailyCap) return 'brake_cap'
    const decided = counts.blocked + counts.autoRuns
    if (decided >= BLOCK_BRAKE_MIN_DECIDED && counts.blocked / decided > BLOCK_SHARE_BRAKE) return 'brake_blocks'
    if (await this.deps.autopilot.volumeSpike(config.htxCode, dayStart)) return 'brake_volume'
    return null
  }

  private async stop(config: AutopilotConfig, reason: StopReason, result: TickResult): Promise<void> {
    const stopped = await this.deps.autopilot.stop(config.htxCode, reason, null)
    if (!stopped) return
    result.stopped = reason
    result.returned = stopped.returned
    try {
      await this.deps.notifier.stopped(config.htxCode, reason, stopped.returned, config.dailyCap)
    } catch (err) {
      console.error('[AutopilotTick] could not queue the stop message', err)
    }
  }

  private async runOne(
    config: AutopilotConfig,
    htxProfileId: string,
    proposalId: string,
    dayStart: Date
  ): Promise<'ran' | 'failed' | 'returned' | 'skipped'> {
    const { htxCode } = config
    const proposal = await this.deps.proposals.findById(htxCode, proposalId)
    const definition = proposal ? getAction(proposal.kind) : undefined
    if (!proposal || !definition || proposal.status !== 'proposed') return 'skipped'

    // The conditions of scheduling may have changed (unlock closed, kind no longer eligible): back to normal approval.
    if (!autoEligibility(proposal, definition, config).eligible) return this.giveBack(htxCode, proposalId)
    if (proposal.kind === 'notification.households' && (await this.householdCapReached(config, htxProfileId, proposal.payload, dayStart))) {
      return this.giveBack(htxCode, proposalId)
    }

    let outcome: DecideProposalOutcome
    try {
      outcome = await this.deps.decide({
        proposalId,
        tenant: { userId: config.enabledBy!, role: 'manager', htxCode, htxProfileId },
        userName: `AI tự thực hiện (bật bởi ${config.enabledByName ?? config.enabledBy})`,
        decision: 'approve',
        channel: 'autopilot',
        now: this.now(),
      })
    } catch (err) {
      // Refused before it could run (for example the manager may no longer decide it): a person decides.
      if (!(err instanceof DomainError)) console.error('[AutopilotTick] decision failed for proposal', proposalId, err)
      await this.deps.autopilot.clearWindow(htxCode, proposalId)
      return 'failed'
    }

    if (outcome.outcome === 'already_decided') return 'skipped'
    await this.deps.notifier.decided(htxCode, proposalId).catch((err) =>
      console.error('[AutopilotTick] could not sync the proposal message', proposalId, err)
    )
    if (outcome.outcome === 'executed') return 'ran'
    if (outcome.outcome === 'failed' || outcome.outcome === 'stale') return 'failed'
    return 'returned'
  }

  private async giveBack(htxCode: string, proposalId: string): Promise<'returned'> {
    await this.deps.autopilot.clearWindow(htxCode, proposalId)
    return 'returned'
  }

  /** Each household may get at most two automatic messages a day; one at the cap holds the whole proposal back. */
  private async householdCapReached(
    config: AutopilotConfig,
    htxProfileId: string,
    payload: Record<string, unknown>,
    dayStart: Date
  ): Promise<boolean> {
    const codes = ((payload.slots as { parcel_codes?: string[] } | undefined)?.parcel_codes ?? []) as string[]
    const targets = await this.deps.autopilot.householdsOfParcels(htxProfileId, codes)
    if (targets.length === 0) return false
    const counts = await this.deps.autopilot.householdMessageCounts(config.htxCode, htxProfileId, dayStart)
    return targets.some((household) => (counts.get(household) ?? 0) >= HOUSEHOLD_DAILY_MESSAGE_CAP)
  }
}
