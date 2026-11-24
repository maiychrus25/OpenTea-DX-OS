// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** Agents a manager can point at an external provider (A1 and A6). */
export const CONFIGURABLE_AGENTS = ['journal-review', 'digest'] as const
export type ConfigurableAgent = (typeof CONFIGURABLE_AGENTS)[number]

export const AGENT_PROVIDERS = ['ollama', 'anthropic', 'openai'] as const
export type AgentProvider = (typeof AGENT_PROVIDERS)[number]

export const EXTERNAL_PROVIDERS: readonly AgentProvider[] = ['anthropic', 'openai']

/** Reserved `agent_settings` row that holds the cooperative's monthly budget. */
export const BUDGET_SETTINGS_AGENT = 'cooperative'

export const DEFAULT_REPORT_TIME = '18:00'
export const REPORT_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
