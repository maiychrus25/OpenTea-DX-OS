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

export interface AgentSettingsRepository {
  load(htxCode: string): Promise<AgentSettingsSnapshot>
  /** `ollama` plus each external provider whose key the agent container reported in its heartbeat. */
  availableProviders(htxCode: string): Promise<AgentProvider[]>
  save(htxCode: string, input: SaveAgentSettingsInput): Promise<void>
}
