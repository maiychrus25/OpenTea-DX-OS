// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { AutopilotConfig, AutopilotDayCounts, AutopilotDaySummary, KindMatchRate, StopReason } from '../autopilot'

export interface EnableAutopilotRecord {
  userId: string
  userName: string
  unlockedKinds: string[]
  dailyCap: number
  /** The enable screen as shown (kinds, rates, caps): saved whole in the audit event. */
  snapshot: Record<string, unknown>
}

export interface DueProposal {
  id: string
  agent: string
  kind: string
}

export type BlockOutcome = 'blocked' | 'already_ran' | 'not_scheduled' | 'not_found'

export interface AutopilotRepository {
  /** A cooperative without a row reads as disabled. */
  get(htxCode: string): Promise<AutopilotConfig>
  /** Turns the mode on (a stopped row is reused) and writes the audit event `autopilot.enabled`. */
  enable(htxCode: string, record: EnableAutopilotRecord): Promise<void>
  /**
   * Turns the mode off, clears `run_at` and `run_claimed_at` of every pending proposal and writes `autopilot.stopped`.
   * Answers how many windows were returned, or null when the mode was already off.
   */
  stop(htxCode: string, reason: StopReason, by: string | null): Promise<{ returned: number } | null>
  /** At most once a minute per cooperative. Does nothing for a cooperative without a row. */
  touchManagerActivity(htxCode: string, now: Date): Promise<void>
  /** Exclusive: two callers never get the same proposal. */
  claimDue(htxCode: string, limit: number): Promise<DueProposal[]>
  /** Returns a claimed or windowed proposal to normal approval (clears `run_at` and `run_claimed_at`). */
  clearWindow(htxCode: string, proposalId: string): Promise<void>
  /** Chặn: only while the proposal is open, has a window and is not claimed by the tick yet. */
  block(htxCode: string, proposalId: string, userId: string): Promise<BlockOutcome>
  dayCounts(htxCode: string, dayStart: Date, now: Date): Promise<AutopilotDayCounts>
  /** The agent whose proposals today exceed 3 times its 14-day daily average (average at least 1), or null. */
  volumeSpike(htxCode: string, dayStart: Date): Promise<string | null>
  matchRates(htxCode: string, since: Date): Promise<KindMatchRate[]>
  /** Households that got an automatic message today (by auto-run) and how many; keyed by household id. */
  householdMessageCounts(htxCode: string, htxProfileId: string, dayStart: Date): Promise<Map<string, number>>
  /** Household ids behind the parcel codes of a `notification.households` payload. */
  householdsOfParcels(htxProfileId: string, parcelCodes: string[]): Promise<string[]>
  /** The 18:00 report's figures for a Vietnam day; `wasOn` is false when the mode was off all day. */
  daySummary(htxCode: string, dayStart: Date, dayEnd: Date): Promise<AutopilotDaySummary>
}
