// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** One group of decided proposals of a cooperative: an agent, a kind and, for templated kinds, its template. */
export interface ProposalStatRow {
  agent: string
  kind: string
  template: string | null
  approved: number
  rejected: number
  expired: number
  medianWaitHours: number | null
}

export interface JournalReviewStat {
  reviewed: number
  returnedMissingInfo: number
}

export interface CampaignGoalStat {
  goalKey: string
  days: number
  missedDays: number
}

/** The figures A10 reads over the cooperative's own tables; the agent never reads them directly (contract C3). */
export interface ImprovementStatsReader {
  proposalStats(htxCode: string, since: Date): Promise<ProposalStatRow[]>
  overallMedianWaitHours(htxCode: string, since: Date): Promise<number | null>
  journalReview(htxCode: string, since: Date): Promise<JournalReviewStat>
  campaignGoals(htxCode: string, sinceDay: string): Promise<CampaignGoalStat[]>
}
