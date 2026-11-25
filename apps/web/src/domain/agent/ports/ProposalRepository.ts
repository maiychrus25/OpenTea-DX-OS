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
  dedupeKey: string
  subjects: string[]
  expiresAt: Date
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
}

/** Who acted and on what, recorded in the audit details of an execution outcome. */
export interface ExecutionAuditMeta {
  actorId?: string
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
  markStale(htxCode: string, id: string, meta?: { actorId?: string }): Promise<boolean>
  markExpired(htxCode: string, id: string, meta?: { actorId?: string }): Promise<boolean>
  markExecuted(id: string, result: Record<string, unknown>, meta?: ExecutionAuditMeta): Promise<void>
  markFailed(id: string, error: string, meta?: ExecutionAuditMeta): Promise<void>
}
