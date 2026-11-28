// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { AgentProvider, ConfigurableAgent } from '../settings'

export interface AgentSettingRecord {
  enabled: boolean
  provider: AgentProvider
  model: string | null
  schedule: string | null
  thresholds: Record<string, unknown>
}

export interface AgentSettingsSnapshot {
  agents: Partial<Record<ConfigurableAgent, AgentSettingRecord>>
  monthlyLimit: number | null
  /** Thresholds of the cross-check agent's row (it has no provider choice), or null when the cooperative has none. */
  crossCheckThresholds?: Record<string, unknown> | null
}

/** What a manager chooses per agent; turning the agent on or off stays with `./dxos agent enable`. */
export interface AgentChoice {
  provider: AgentProvider
  model: string | null
}

export interface SaveAgentSettingsInput {
  /** Audit actor, for example `user:<id>`. */
  actor: string
  agents: Record<ConfigurableAgent, AgentChoice>
  reportTime: string
  monthlyLimit: number | null
}

/** The keys one agent's row holds that a weekly improvement may change (contract C2). */
export interface AgentSettingsValues {
  thresholds: Record<string, unknown>
  schedule: string | null
}

export interface AgentSettingsRepository {
  /** Merges the given thresholds into the agent's row, creating it (switched off) when missing; audited under `actor`. */
  upsertThresholds(htxCode: string, agent: string, thresholds: Record<string, number>, actor: string): Promise<void>
  load(htxCode: string): Promise<AgentSettingsSnapshot>
  /** `ollama` plus each external provider whose key the agent container reported in its heartbeat. */
  availableProviders(htxCode: string): Promise<AgentProvider[]>
  save(htxCode: string, input: SaveAgentSettingsInput): Promise<void>
  /** The thresholds and schedule of one agent's row, or null when the cooperative has no such row. */
  findForEvidence(htxCode: string, agent: string): Promise<AgentSettingsValues | null>
  /** Merges only the given thresholds and sets the schedule when given; returns the values before and after. */
  applyKeys(
    htxCode: string,
    agent: string,
    change: AgentSettingsValues,
    actor: string
  ): Promise<{ before: AgentSettingsValues; after: AgentSettingsValues }>
}
