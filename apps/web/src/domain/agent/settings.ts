// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** Agents a manager can point at a model provider: A1, A5, A6 and the Telegram assistant (A7). */
export const CONFIGURABLE_AGENTS = ['journal-review', 'digest', 'bulletin', 'assistant'] as const
export type ConfigurableAgent = (typeof CONFIGURABLE_AGENTS)[number]

export const AGENT_PROVIDERS = ['ollama', 'anthropic', 'openai'] as const
export type AgentProvider = (typeof AGENT_PROVIDERS)[number]

export const EXTERNAL_PROVIDERS: readonly AgentProvider[] = ['anthropic', 'openai']

/** Reserved `agent_settings` row that holds the cooperative's monthly budget. */
export const BUDGET_SETTINGS_AGENT = 'cooperative'

export const DEFAULT_REPORT_TIME = '18:00'
export const REPORT_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
