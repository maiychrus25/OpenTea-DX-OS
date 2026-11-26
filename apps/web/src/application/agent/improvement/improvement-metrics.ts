// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { CampaignGoalStat, JournalReviewStat, ProposalStatRow } from '@/domain/agent/ports/ImprovementStatsReader'

export interface ImprovementStats {
  proposalStats: ProposalStatRow[]
  journalReview: JournalReviewStat
  campaignGoals: CampaignGoalStat[]
  medianWaitHours: number | null
}

function metricValue(key: string, stats: ImprovementStats): number | null {
  if (key === 'journal_missing_info_rate') {
    const { reviewed, returnedMissingInfo } = stats.journalReview
    return reviewed > 0 ? returnedMissingInfo / reviewed : null
  }
  if (key === 'median_wait_hours') return stats.medianWaitHours
  if (key.startsWith('reject_rate:')) {
    // `reject_rate:<agent>:<template or kind>`: rejected over decided, for the rows of that agent and label.
    const [, agent, label] = key.split(':')
    const rows = stats.proposalStats.filter((row) => row.agent === agent && (row.template ?? row.kind) === label)
    const approved = rows.reduce((sum, row) => sum + row.approved, 0)
    const rejected = rows.reduce((sum, row) => sum + row.rejected, 0)
    return approved + rejected > 0 ? rejected / (approved + rejected) : null
  }
  if (key.startsWith('missed_days:')) {
    const goal = stats.campaignGoals.find((row) => row.goalKey === key.slice('missed_days:'.length))
    return goal ? goal.missedDays : null
  }
  return null
}

/** Today's value of each metric key, by the formulas of contract C4. A key without data has no value, so it is not measured. */
export function computeMetrics(metricKeys: readonly string[], stats: ImprovementStats): Record<string, number> {
  const values: Record<string, number> = {}
  for (const key of metricKeys) {
    const value = metricValue(key, stats)
    if (value !== null) values[key] = value
  }
  return values
}
