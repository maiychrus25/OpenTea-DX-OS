// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** The latest executed harvest decision of one parcel of a lot, with the audit event that approved it. */
export interface HarvestDecision {
  proposalId: string
  proposalEvidenceSha256: string | null
  /** The `agent.proposal.approved` audit event of the proposal. */
  eventId: string
  eventEvidenceSha256: string | null
  /** Realm role of the approver as recorded in the event; never a name. */
  role: string | null
  decidedAt: Date
}

export interface LotVerificationRepository {
  /** One row per parcel of the lot that has an executed harvest proposal created before the lot. */
  findHarvestDecisions(lotCode: string): Promise<HarvestDecision[]>
  /** True when `audit.verify_chain()` reports no bad row up to and including this event. */
  auditChainIntactThrough(eventId: string): Promise<boolean>
}
