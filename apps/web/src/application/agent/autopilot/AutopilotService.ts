// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ACTION_CATALOG, type ActionDefinition } from '@/application/agent/action-catalog'
import { vnDayOf, vnDayStart } from '@/application/agent/campaign/vn-day'
import type { AutopilotConfig, KindMatchRate, StopReason } from '@/domain/agent/autopilot'
import { MAX_DAILY_CAP, REAUTH_MAX_AGE_SECONDS } from '@/domain/agent/autopilot'
import type { AutopilotRepository } from '@/domain/agent/ports/AutopilotRepository'
import { ValidationError } from '@/domain/errors'
import { windowFor } from './eligibility'

/** The match rate below which the enable screen warns (spec §11.3). */
export const MATCH_RATE_WARNING = 0.9
const MATCH_WINDOW_MS = 30 * 24 * 60 * 60_000

/** The session's sign-in is older than five minutes (or unknown): the web sends the person through sign-in again. */
export class ReauthRequiredError extends Error {
  constructor() {
    super('REAUTH_REQUIRED')
    this.name = 'ReauthRequiredError'
  }
}

export interface AutopilotKindView {
  kind: string
  title_vi: string
  autonomy: ActionDefinition['autonomy']
  risk: ActionDefinition['risk']
  window_minutes: number
  /** Share of a person's decisions in the last 30 days that matched; null with no sample. */
  match_rate: number | null
  sample: number
  warning: boolean
  unlocked: boolean
}

export interface AutopilotView {
  enabled: boolean
  enabled_by_name: string | null
  enabled_at: string | null
  stopped_at: string | null
  stop_reason: StopReason | null
  daily_cap: number
  unlocked_kinds: string[]
  kinds: AutopilotKindView[]
  today: { ran: number; blocked: number; pending: number }
}

export interface AutopilotNotifier {
  /** Tells every linked manager and officer; a failure never fails the change itself. */
  enabled(htxCode: string, enabledByName: string, unlockedKinds: string[], dailyCap: number): Promise<void>
  stopped(htxCode: string, reason: StopReason, returned: number, dailyCap: number): Promise<void>
}

export interface EnableInput {
  htxCode: string
  userId: string
  userName: string
  unlockedKinds: string[]
  dailyCap: number
  acknowledged: boolean
  /** Seconds since the epoch of the session's last sign-in with credentials. */
  authTime: number | undefined
  now?: Date
}

function kindViews(config: AutopilotConfig, rates: KindMatchRate[], unlocked: readonly string[]): AutopilotKindView[] {
  return Object.values(ACTION_CATALOG).map((definition) => {
    const rate = rates.find((r) => r.kind === definition.kind)
    const share = rate && rate.sample > 0 ? rate.matched / rate.sample : null
    return {
      kind: definition.kind,
      title_vi: definition.titleVi,
      autonomy: definition.autonomy,
      risk: definition.risk,
      window_minutes: windowFor(definition) / 60_000,
      match_rate: share,
      sample: rate?.sample ?? 0,
      warning: share !== null && share < MATCH_RATE_WARNING,
      unlocked: unlocked.includes(definition.kind) && definition.autonomy === 'unlockable' && config.enabled,
    }
  })
}

/** The enable screen, the status, and the turn on and off of autonomous mode on the web (contract C4). */
export class AutopilotService {
  constructor(
    private readonly deps: { autopilot: AutopilotRepository; notifier: AutopilotNotifier; now?: () => Date }
  ) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date()
  }

  async view(htxCode: string): Promise<AutopilotView> {
    const now = this.now()
    const config = await this.deps.autopilot.get(htxCode)
    const rates = await this.deps.autopilot.matchRates(htxCode, new Date(now.getTime() - MATCH_WINDOW_MS))
    const counts = await this.deps.autopilot.dayCounts(htxCode, vnDayStart(vnDayOf(now)), now)
    return {
      enabled: config.enabled,
      enabled_by_name: config.enabledByName,
      enabled_at: config.enabledAt?.toISOString() ?? null,
      stopped_at: config.stoppedAt?.toISOString() ?? null,
      stop_reason: config.stopReason,
      daily_cap: config.dailyCap,
      unlocked_kinds: config.unlockedKinds,
      kinds: kindViews(config, rates, config.unlockedKinds),
      today: { ran: counts.autoRuns, blocked: counts.blocked, pending: await this.deps.autopilot.countPending(htxCode) },
    }
  }

  /** Only a manager with a sign-in at most five minutes old, who acknowledged the screen, turns the mode on. */
  async enable(input: EnableInput): Promise<AutopilotView> {
    const now = input.now ?? this.now()
    if (!input.acknowledged) throw new ValidationError('Bạn cần xác nhận đã hiểu trước khi bật tự vận hành')
    if (!Number.isInteger(input.dailyCap) || input.dailyCap < 1 || input.dailyCap > MAX_DAILY_CAP) {
      throw new ValidationError(`Giới hạn mỗi ngày phải từ 1 đến ${MAX_DAILY_CAP}`)
    }
    const opened = Array.from(new Set(input.unlockedKinds))
    for (const kind of opened) {
      const definition = Object.prototype.hasOwnProperty.call(ACTION_CATALOG, kind) ? ACTION_CATALOG[kind] : undefined
      if (definition?.autonomy !== 'unlockable') throw new ValidationError(`Loại ${kind} không thể mở cho tự vận hành`)
    }
    if (input.authTime === undefined || now.getTime() / 1000 - input.authTime > REAUTH_MAX_AGE_SECONDS) {
      throw new ReauthRequiredError()
    }

    // The screen as the manager saw it: the kinds, their rates and the caps. It is saved whole in the audit event.
    const config = await this.deps.autopilot.get(input.htxCode)
    const rates = await this.deps.autopilot.matchRates(input.htxCode, new Date(now.getTime() - MATCH_WINDOW_MS))
    const snapshot = {
      kinds: kindViews(config, rates, opened).map((k) => ({ ...k, unlocked: opened.includes(k.kind) })),
      daily_cap: input.dailyCap,
      household_message_cap: 2,
      acknowledged: true,
    }
    await this.deps.autopilot.enable(input.htxCode, {
      userId: input.userId,
      userName: input.userName,
      unlockedKinds: opened,
      dailyCap: input.dailyCap,
      snapshot,
    })
    await this.deps.notifier
      .enabled(input.htxCode, input.userName, opened, input.dailyCap)
      .catch((err) => console.error('[Autopilot] could not queue the enable message', err))
    return this.view(input.htxCode)
  }

  /** Dừng ngay: stops with reason `manual`. Already off answers `null`. */
  async stop(htxCode: string, userId: string): Promise<{ returned: number } | null> {
    const config = await this.deps.autopilot.get(htxCode)
    const stopped = await this.deps.autopilot.stop(htxCode, 'manual', userId)
    if (stopped) {
      await this.deps.notifier
        .stopped(htxCode, 'manual', stopped.returned, config.dailyCap)
        .catch((err) => console.error('[Autopilot] could not queue the stop message', err))
    }
    return stopped
  }
}
