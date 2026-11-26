// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { AgentSettingsValues } from '@/domain/agent/ports/AgentSettingsRepository'
import type { Improvement } from '@/domain/agent/ports/ImprovementRepository'

/** Evidence values of an agent's settings row: exactly what `agent.settings.update` may change. */
export function agentSettingsValues(row: AgentSettingsValues): Record<string, unknown> {
  return { thresholds: row.thresholds, schedule: row.schedule }
}

/**
 * Evidence values of an improvement row. The effect is left out because it changes after the decision, and the
 * baseline because canonical JSON hashes only integers.
 */
export function improvementValues(row: Improvement): Record<string, unknown> {
  return {
    id: row.id,
    kind: row.kind,
    metric_key: row.metricKey,
    title_vi: row.titleVi,
    rationale_vi: row.rationaleVi,
    template: row.template,
  }
}

/** The agent of an `agent_settings` evidence id `<htx>:<agent>`, or null when the id belongs to another cooperative. */
export function settingsAgentOf(htxCode: string, id: string): string | null {
  const prefix = `${htxCode}:`
  return id.startsWith(prefix) && id.length > prefix.length ? id.slice(prefix.length) : null
}
