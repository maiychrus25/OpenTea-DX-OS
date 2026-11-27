// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { SETTING_KEYS, type ThresholdSetting } from '@/application/agent/actions/agent-settings-update.action'
import type { ActionDefinition } from '@/application/agent/action-catalog'
import type { Evidence, Origin } from '@/domain/agent/proposal'

export interface EligibilityConfig {
  unlockedKinds: readonly string[]
}

export interface EligibilityProposal {
  origin: Origin
  payload: Record<string, unknown>
  evidence: Evidence
}

export interface Eligibility {
  eligible: boolean
  reason: string
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

/** The blocking window of a kind by risk. A zero window means the next tick. */
export function windowFor(definition: Pick<ActionDefinition, 'kind' | 'risk' | 'money'>): number {
  if (definition.kind === 'strategy.adopt') return 48 * HOUR_MS
  if (definition.money) return 2 * HOUR_MS
  if (definition.risk === 'high') return 2 * HOUR_MS
  if (definition.risk === 'medium') return 15 * MINUTE_MS
  return 0
}

type ThresholdTable = Record<string, ThresholdSetting>

function currentThresholds(evidence: Evidence): Record<string, unknown> {
  const row = evidence.rows.find((r) => r.table === 'agent_settings')
  return (row?.values?.thresholds as Record<string, unknown> | undefined) ?? {}
}

/** True only when every change moves the agent in its stricter direction (or keeps the value); an unknown key fails. */
function onlyTightens(payload: Record<string, unknown>, current: Record<string, unknown>): boolean {
  const agent = payload.agent as string
  const thresholds = (payload.thresholds ?? {}) as Record<string, number>
  const keys = Object.keys(thresholds)
  if (keys.length === 0) return typeof payload.schedule === 'string'
  if (agent === 'digest') return false
  const defined = (SETTING_KEYS as Record<string, { thresholds?: ThresholdTable }>)[agent]?.thresholds
  if (!defined) return false
  return keys.every((key) => {
    const setting = defined[key]
    if (!setting) return false
    const from = Number(current[key] ?? setting.defaultValue)
    const to = thresholds[key]
    return setting.stricter === 'lower' ? to <= from : to >= from
  })
}

/**
 * Whether a proposal may run on its own (spec §11.1). Pure: the mode itself is checked by the caller.
 * Never-kinds, unopened unlockable kinds, user proposals and kinds a manager cannot decide are never eligible.
 */
export function autoEligibility(
  proposal: EligibilityProposal,
  definition: ActionDefinition,
  config: EligibilityConfig,
  /** The cooperative's stored thresholds of the agent; the tick passes them so the run never trusts the evidence alone. */
  liveThresholds?: Record<string, unknown>
): Eligibility {
  if (proposal.origin !== 'agent') return { eligible: false, reason: 'origin_user' }
  if (definition.autonomy === 'never') return { eligible: false, reason: 'never' }
  if (definition.autonomy === 'unlockable' && !config.unlockedKinds.includes(definition.kind)) {
    return { eligible: false, reason: 'not_unlocked' }
  }
  if (!definition.approverRoles.includes('manager')) return { eligible: false, reason: 'manager_cannot_decide' }
  if (
    definition.kind === 'agent.settings.update' &&
    !onlyTightens(proposal.payload, liveThresholds ?? currentThresholds(proposal.evidence))
  ) {
    return { eligible: false, reason: 'loosens_setting' }
  }
  if (definition.kind === 'strategy.adopt') {
    // The plan row's values carry its warnings; their hash is checked at creation and against the stored row before a
    // run, so without them the warnings cannot be read and a person decides (test 37).
    const warnings = proposal.evidence.rows.find((r) => r.table === 'strategy_plans')?.values?.warnings
    if (!Array.isArray(warnings) || warnings.length > 0) return { eligible: false, reason: 'rule_warning' }
  }
  if (definition.kind === 'journal.approve') {
    const warnings = proposal.payload.warnings
    if (Array.isArray(warnings) && warnings.length > 0) return { eligible: false, reason: 'rule_warning' }
  }
  return { eligible: true, reason: 'ok' }
}

/** The shadow value: eligibility with every unlockable kind treated as opened. */
export function shadowEligibility(proposal: EligibilityProposal, definition: ActionDefinition): boolean {
  return autoEligibility(proposal, definition, { unlockedKinds: [definition.kind] }).eligible
}
