// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { Campaign, CampaignItem, CampaignStatus } from '@/domain/agent/campaign'
import type { ProposalStatus, Risk } from '@/domain/agent/proposal'
import { getAction } from '../action-catalog'

export interface CampaignViewItem {
  position: number
  proposalId: string
  kind: string
  titleVi: string
  status: ProposalStatus
  risk: Risk
  goalLine: string
}

export interface CampaignView {
  id: string
  day: string
  status: CampaignStatus
  summaryVi: string
  decidedByName: string | null
  items: CampaignViewItem[]
}

/** What the inbox panel shows for a campaign: item titles and goal lines (contract C8). */
export function campaignView(campaign: Campaign, items: CampaignItem[]): CampaignView {
  return {
    id: campaign.id,
    day: campaign.day,
    status: campaign.status,
    summaryVi: campaign.summaryVi,
    decidedByName: campaign.decidedByName,
    items: [...items]
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        position: item.position,
        proposalId: item.proposalId,
        kind: item.kind,
        titleVi: getAction(item.kind)?.titleVi ?? item.kind,
        status: item.proposalStatus,
        risk: item.risk,
        goalLine: `${item.target} ${campaign.goals.find((g) => g.goalKey === item.goalKey)?.unitVi ?? 'việc'}`,
      })),
  }
}
