// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export const STOP_REASONS = [
  'manual',
  'enabler_lost',
  'inactive',
  'brake_failures',
  'brake_cap',
  'brake_blocks',
  'brake_volume',
] as const
export type StopReason = (typeof STOP_REASONS)[number]

export const MAX_DAILY_CAP = 50
/** Automatic messages one household may get per day (notification.households). */
export const HOUSEHOLD_DAILY_MESSAGE_CAP = 2
/** The enabler must have signed in this recently (seconds) to turn the mode on. */
export const REAUTH_MAX_AGE_SECONDS = 5 * 60

/** The cooperative's autonomous-mode row; a cooperative without a row is a disabled default. */
export interface AutopilotConfig {
  htxCode: string
  enabled: boolean
  enabledBy: string | null
  enabledByName: string | null
  enabledAt: Date | null
  unlockedKinds: string[]
  dailyCap: number
  stoppedAt: Date | null
  stoppedBy: string | null
  stopReason: StopReason | null
  lastManagerActivityAt: Date | null
}

export function disabledConfig(htxCode: string): AutopilotConfig {
  return {
    htxCode,
    enabled: false,
    enabledBy: null,
    enabledByName: null,
    enabledAt: null,
    unlockedKinds: [],
    dailyCap: MAX_DAILY_CAP,
    stoppedAt: null,
    stoppedBy: null,
    stopReason: null,
    lastManagerActivityAt: null,
  }
}

/** Share of decided proposals of a kind where `shadow_auto` matched what a person decided, over 30 days. */
export interface KindMatchRate {
  kind: string
  /** Decided proposals (not expired) with a recorded shadow value. */
  sample: number
  matched: number
}

/** Counts of the Vietnam day so far and the figures the brakes read. */
export interface AutopilotDayCounts {
  autoRuns: number
  blocked: number
  /** Auto-runs that ended failed or stale in the last hour. */
  failuresLastHour: number
}

export interface AutopilotDaySummary {
  wasOn: boolean
  ran: number
  blocked: number
  brakes: number
  costUsd: number
}
