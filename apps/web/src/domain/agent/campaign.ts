// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { ProposalStatus, Risk } from './proposal'

export type CampaignStatus = 'draft' | 'approved' | 'partial' | 'done' | 'dropped'
export type CampaignDropRule = 'withdrawal' | 'rain' | 'people' | 'overflow'

export interface CampaignGoal {
  goalKey: string
  labelVi: string
  unitVi: string
  target: number
}

export interface Campaign {
  id: string
  htxCode: string
  /** Vietnam calendar day, `YYYY-MM-DD`. */
  day: string
  status: CampaignStatus
  goals: CampaignGoal[]
  summaryVi: string
  runId: string | null
  decidedBy: string | null
  decidedByName: string | null
  decidedAt: Date | null
  telegramSent: boolean
  createdAt: Date
}

export interface CampaignItem {
  campaignId: string
  proposalId: string
  position: number
  goalKey: string
  target: number
  kind: string
  risk: Risk
  proposalStatus: ProposalStatus
}
