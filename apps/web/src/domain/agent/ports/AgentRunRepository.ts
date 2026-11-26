// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export type AgentRunTrigger = 'schedule' | 'event' | 'manual' | 'message'
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
  provider?: string | null
  model?: string | null
  tokensIn?: number | null
  tokensOut?: number | null
  costEstimate?: number | null
  /** Provider calls that left the server during the run; each run with calls gets one audit event. */
  externalCalls?: number | null
  error?: string | null
}

export interface AgentRunRepository {
  start(input: StartAgentRunInput): Promise<{ id: string }>
  finish(htxCode: string, id: string, input: FinishAgentRunInput): Promise<boolean>
  existsForHtx(htxCode: string, id: string): Promise<boolean>
  /** Sum of the estimated cost of the cooperative's runs started in [start, end). */
  spentBetween(htxCode: string, start: Date, end: Date): Promise<number>
}
