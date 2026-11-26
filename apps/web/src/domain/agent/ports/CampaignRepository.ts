// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { CampaignDropRule, CampaignGoal, CampaignItem, CampaignStatus, Campaign } from '../campaign'

export interface CreateCampaignRecord {
  htxCode: string
  day: string
  summaryVi: string
  runId: string
  goals: CampaignGoal[]
  items: { proposalId: string; position: number; goalKey: string; target: number }[]
  dropped: { proposalId: string; rule: CampaignDropRule }[]
}

export interface CampaignDecider {
  userId: string
  userName: string
}

export interface CampaignOutcome {
  goalKey: string
  target: number
  actual: number
}

export interface CampaignRepository {
  /** Inserts the campaign unless the cooperative already has one for the day, in which case nothing is written. */
  create(input: CreateCampaignRecord): Promise<{ id: string; created: boolean }>
  findForDay(htxCode: string, day: string): Promise<Campaign | null>
  findById(htxCode: string, id: string): Promise<Campaign | null>
  /** Items in position order, with the proposal's kind, risk and current status. */
  items(htxCode: string, campaignId: string): Promise<CampaignItem[]>
  /** Moves the campaign to `to` only when it is in one of `from`; the event is written in the same transaction. */
  setStatus(
    htxCode: string,
    campaignId: string,
    transition: {
      to: CampaignStatus
      from: readonly CampaignStatus[]
      decidedBy?: CampaignDecider
      event: { op: string; details: Record<string, unknown> }
    }
  ): Promise<boolean>
  /** The draft campaign that holds this proposal as an item, or null. */
  itemOfDraftCampaign(htxCode: string, proposalId: string): Promise<{ id: string } | null>
  writeOutcomes(htxCode: string, campaignId: string, outcomes: CampaignOutcome[]): Promise<void>
  markTelegramSent(htxCode: string, campaignId: string): Promise<void>
}
