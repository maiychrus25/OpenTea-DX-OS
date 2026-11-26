// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export type ProposalStatus =
  | 'proposed'
  | 'approved'
  | 'executed'
  | 'failed'
  | 'rejected'
  | 'expired'
  | 'stale'
  | 'sent_to_staff_app'

export const KNOWN_AGENTS = ['journal-review', 'field-watch', 'disease-watch', 'harvest-ready', 'bulletin', 'assistant', 'daily-campaign', 'improvement', 'staff-tasks'] as const
export type KnownAgent = (typeof KNOWN_AGENTS)[number]

export type Risk = 'low' | 'medium' | 'high'
export type Origin = 'agent' | 'user'
export type DecisionChannel = 'web' | 'telegram' | 'autopilot'

export interface EvidenceRow {
  table: string
  id: string
  sha256: string
  values?: Record<string, unknown>
}

export interface Evidence {
  rows: EvidenceRow[]
  sha256: string
}

export interface Proposal {
  id: string
  htxCode: string
  runId: string | null
  agent: string
  kind: string
  payload: Record<string, unknown>
  reasonVi: string
  evidence: Evidence
  confidence: number | null
  risk: Risk
  status: ProposalStatus
  origin: Origin
  requestedBy: string | null
  dedupeKey: string
  createdAt: Date
  expiresAt: Date
  decidedBy: string | null
  decidedByName: string | null
  decidedAt: Date | null
  decisionChannel: DecisionChannel | null
  decisionNote: string | null
  editedPayload: Record<string, unknown> | null
  executedAt: Date | null
  result: Record<string, unknown> | null
  /** M12: whether this proposal would have run on its own, recorded at creation in either mode. */
  shadowAuto?: boolean | null
  /** M12: when the tick may run it, set only while autonomous mode is on. */
  runAt?: Date | null
  blockedBy?: string | null
  blockedAt?: Date | null
}
