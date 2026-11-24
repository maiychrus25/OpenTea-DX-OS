// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export type AgentRunTrigger = 'schedule' | 'event' | 'manual'
export type AgentRunTerminalStatus = 'ok' | 'failed' | 'skipped'

export interface StartAgentRunInput {
  htxCode: string
  agent: string
  trigger: AgentRunTrigger
  provider?: string | null
  model?: string | null
  promptVersion?: string | null
  inputHash?: string | null
}

export interface FinishAgentRunInput {
  status: AgentRunTerminalStatus
  tokensIn?: number | null
  tokensOut?: number | null
  costEstimate?: number | null
  error?: string | null
}

export interface AgentRunRepository {
  start(input: StartAgentRunInput): Promise<{ id: string }>
  finish(htxCode: string, id: string, input: FinishAgentRunInput): Promise<boolean>
  existsForHtx(htxCode: string, id: string): Promise<boolean>
}
