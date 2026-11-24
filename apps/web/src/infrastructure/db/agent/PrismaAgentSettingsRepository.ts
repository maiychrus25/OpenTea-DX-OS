// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type {
  AgentSettingRecord,
  AgentSettingsRepository,
  AgentSettingsSnapshot,
  SaveAgentSettingsInput,
} from '@/domain/agent/ports/AgentSettingsRepository'
import {
  AGENT_PROVIDERS,
  BUDGET_SETTINGS_AGENT,
  CONFIGURABLE_AGENTS,
  EXTERNAL_PROVIDERS,
  type AgentProvider,
  type ConfigurableAgent,
} from '@/domain/agent/settings'
import { prisma } from '@/infrastructure/db/prisma.client'

interface SettingsDbRow {
  agent: string
  enabled: boolean
  provider: string
  model: string | null
  schedule: string | null
  thresholds: Record<string, unknown> | null
  monthly_budget: number | null
}

function isConfigurable(agent: string): agent is ConfigurableAgent {
  return (CONFIGURABLE_AGENTS as readonly string[]).includes(agent)
}

function asProvider(value: string): AgentProvider {
  return (AGENT_PROVIDERS as readonly string[]).includes(value) ? (value as AgentProvider) : 'ollama'
}

/** Persistence adapter for `platform.agent_settings` (one row per cooperative and agent) and the agent's provider list. */
export class PrismaAgentSettingsRepository implements AgentSettingsRepository {
  async load(htxCode: string): Promise<AgentSettingsSnapshot> {
    const rows = await prisma.$queryRaw<SettingsDbRow[]>`
      SELECT agent, enabled, provider, model, schedule, thresholds,
             monthly_budget::float8 AS monthly_budget
      FROM platform.agent_settings
      WHERE htx_code = ${htxCode}
    `
    const agents: Partial<Record<ConfigurableAgent, AgentSettingRecord>> = {}
    let monthlyLimit: number | null = null
    for (const row of rows) {
      if (row.agent === BUDGET_SETTINGS_AGENT) {
        monthlyLimit = row.monthly_budget
      } else if (isConfigurable(row.agent)) {
        agents[row.agent] = {
          enabled: row.enabled,
          provider: asProvider(row.provider),
          model: row.model,
          schedule: row.schedule,
          thresholds: row.thresholds ?? {},
        }
      }
    }
    return { agents, monthlyLimit }
  }

  async availableProviders(htxCode: string): Promise<AgentProvider[]> {
    const rows = await prisma.$queryRaw<{ details: { providers?: unknown } | null }[]>`
      SELECT details FROM platform.service_heartbeats WHERE service = ${`agent:${htxCode}`}
    `
    const listed = Array.isArray(rows[0]?.details?.providers) ? (rows[0].details.providers as unknown[]) : []
    return ['ollama', ...EXTERNAL_PROVIDERS.filter((provider) => listed.includes(provider))]
  }

  /** Writes only the rows that change, so the audit trigger records real changes. */
  async save(htxCode: string, input: SaveAgentSettingsInput): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('dxos.actor', ${input.actor}, true)`
      for (const agent of CONFIGURABLE_AGENTS) {
        const choice = input.agents[agent]
        const schedule = agent === 'digest' ? input.reportTime : null
        await tx.$executeRaw`
          INSERT INTO platform.agent_settings (htx_code, agent, provider, model, schedule)
          VALUES (${htxCode}, ${agent}, ${choice.provider}, ${choice.model}, ${schedule})
          ON CONFLICT (htx_code, agent) DO UPDATE
            SET provider = EXCLUDED.provider,
                model = EXCLUDED.model,
                schedule = EXCLUDED.schedule
          WHERE (platform.agent_settings.provider, platform.agent_settings.model, platform.agent_settings.schedule)
            IS DISTINCT FROM (EXCLUDED.provider, EXCLUDED.model, EXCLUDED.schedule)
        `
      }
      await tx.$executeRaw`
        INSERT INTO platform.agent_settings (htx_code, agent, monthly_budget)
        VALUES (${htxCode}, ${BUDGET_SETTINGS_AGENT}, ${input.monthlyLimit}::numeric(12,2))
        ON CONFLICT (htx_code, agent) DO UPDATE
          SET monthly_budget = EXCLUDED.monthly_budget
        WHERE platform.agent_settings.monthly_budget IS DISTINCT FROM EXCLUDED.monthly_budget
      `
    })
  }
}
