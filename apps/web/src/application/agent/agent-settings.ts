// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { readMonthlyBudget } from '@/application/agent/agent-budget'
import {
  DEFAULT_REPORT_TIME,
  CONFIGURABLE_AGENTS,
  type AgentProvider,
  type ConfigurableAgent,
} from '@/domain/agent/settings'
import type {
  AgentChoice,
  AgentSettingsRepository,
} from '@/domain/agent/ports/AgentSettingsRepository'
import { ValidationError } from '@/domain/errors'
import { PrismaAgentSettingsRepository } from '@/infrastructure/db/agent/PrismaAgentSettingsRepository'

export interface AgentSettingsView {
  agents: Record<ConfigurableAgent, { enabled: boolean; provider: AgentProvider; model: string | null; thresholds: Record<string, unknown> }>
  report_time: string
  budget: { monthly_limit_usd: number | null; spent_usd: number; month: string; exhausted: boolean }
}

export interface SaveAgentSettingsCommand {
  agents: Record<ConfigurableAgent, AgentChoice>
  reportTime: string
  monthlyLimit: number | null
}

/** Settings of the cooperative's agents: what the agent reads per run (C1) and what a manager saves on the web. */
export class AgentSettingsUseCase {
  constructor(private readonly settings: AgentSettingsRepository = new PrismaAgentSettingsRepository()) {}

  async read(htxCode: string, now: Date = new Date()): Promise<AgentSettingsView> {
    const snapshot = await this.settings.load(htxCode)
    const budget = await readMonthlyBudget(htxCode, now)
    const agents = {} as AgentSettingsView['agents']
    for (const agent of CONFIGURABLE_AGENTS) {
      const row = snapshot.agents[agent]
      agents[agent] = {
        enabled: row?.enabled ?? false,
        provider: row?.provider ?? 'ollama',
        model: row?.model ?? null,
        thresholds: row?.thresholds ?? {},
      }
    }
    return {
      agents,
      report_time: snapshot.agents.digest?.schedule ?? DEFAULT_REPORT_TIME,
      budget: {
        monthly_limit_usd: budget.limit,
        spent_usd: budget.spent,
        month: budget.month,
        exhausted: budget.level === 'exhausted',
      },
    }
  }

  /** Providers the manager may pick: `ollama` and the external ones whose keys the agent container reported. */
  availableProviders(htxCode: string): Promise<AgentProvider[]> {
    return this.settings.availableProviders(htxCode)
  }

  async save(htxCode: string, actor: string, command: SaveAgentSettingsCommand, now: Date = new Date()): Promise<AgentSettingsView> {
    const available = await this.settings.availableProviders(htxCode)
    for (const agent of CONFIGURABLE_AGENTS) {
      if (!available.includes(command.agents[agent].provider)) {
        throw new ValidationError('Nhà cung cấp này chưa được bật trên máy chủ')
      }
    }
    await this.settings.save(htxCode, { actor, ...command })
    return this.read(htxCode, now)
  }
}
