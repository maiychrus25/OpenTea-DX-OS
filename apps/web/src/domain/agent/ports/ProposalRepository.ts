// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { DecisionChannel, Evidence, Origin, Proposal, ProposalStatus, Risk } from '../proposal'

export interface CreateProposalRecord {
  htxCode: string
  runId: string | null
  agent: string
  kind: string
  payload: Record<string, unknown>
  reasonVi: string
  evidence: Evidence
  confidence: number | null
  risk: Risk
  origin: Origin
  requestedBy: string | null
  channel?: string | null
  dedupeKey: string
  subjects: string[]
  expiresAt: Date
  /** M12: would this run on its own (recorded in either mode), and when the tick may run it (mode on only). */
  shadowAuto?: boolean
  runAt?: Date | null
}

export interface ProposalFilter {
  statuses?: ProposalStatus[]
  kind?: string
  limit: number
}

export interface ProposalDecisionRecord {
  userId: string
  userName: string
  role: string
  channel: DecisionChannel
  note: string | null
  editedPayload: Record<string, unknown> | null
  /** M12: an auto-run acts as `autopilot:<agent>`; `enabledBy` names the manager who turned the mode on. */
  autopilot?: { actor: string; enabledBy: string }
}

/** Who acted and on what, recorded in the audit details of an execution outcome. */
export interface ExecutionAuditMeta {
  actorId?: string
  /** Replaces the `user:<actorId>` actor of an auto-run, and records who enabled the mode. */
  autopilot?: { actor: string; enabledBy: string }
  agent?: string
  kind?: string
  subjectIds?: string[]
}

export interface ProposalRepository {
  create(input: CreateProposalRecord): Promise<{ id: string } | null>
  /** Whether a proposal with this dedupe key was created at or after `since`, in any status. */
  createdSince(htxCode: string, dedupeKey: string, since: Date): Promise<boolean>
  list(htxCode: string, filter: ProposalFilter): Promise<Proposal[]>
  findById(htxCode: string, id: string): Promise<Proposal | null>
  claim(htxCode: string, id: string, decision: ProposalDecisionRecord): Promise<Proposal | null>
  markRejected(htxCode: string, id: string, decision: ProposalDecisionRecord): Promise<Proposal | null>
  markStale(htxCode: string, id: string, meta?: Pick<ExecutionAuditMeta, 'actorId' | 'autopilot'>): Promise<boolean>
  markExpired(htxCode: string, id: string, meta?: Pick<ExecutionAuditMeta, 'actorId' | 'autopilot'>): Promise<boolean>
  markExecuted(id: string, result: Record<string, unknown>, meta?: ExecutionAuditMeta): Promise<void>
  markFailed(id: string, error: string, meta?: ExecutionAuditMeta): Promise<void>
}
