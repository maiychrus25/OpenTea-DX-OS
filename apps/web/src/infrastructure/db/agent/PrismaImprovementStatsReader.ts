// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type {
  CampaignGoalStat,
  ImprovementStatsReader,
  JournalReviewStat,
  ProposalStatRow,
} from '@/domain/agent/ports/ImprovementStatsReader'
import { prisma } from '@/infrastructure/db/prisma.client'

/** Read-only aggregates of the cooperative's proposals and campaign outcomes for A10 (contract C3). */
export class PrismaImprovementStatsReader implements ImprovementStatsReader {
  async proposalStats(htxCode: string, since: Date): Promise<ProposalStatRow[]> {
    const rows = await prisma.$queryRaw<
      { agent: string; kind: string; template: string | null; approved: number; rejected: number; expired: number; median_wait_hours: number | null }[]
    >`
      SELECT agent, kind, payload->>'template' AS template,
        count(*) FILTER (WHERE status IN ('approved', 'executed', 'failed'))::int AS approved,
        count(*) FILTER (WHERE status = 'rejected')::int AS rejected,
        count(*) FILTER (WHERE status = 'expired')::int AS expired,
        (percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (decided_at - created_at)) / 3600)
          FILTER (WHERE decided_at IS NOT NULL))::float8 AS median_wait_hours
      FROM platform.agent_proposals
      WHERE htx_code = ${htxCode} AND created_at >= ${since}
      GROUP BY agent, kind, payload->>'template'
      ORDER BY agent, kind, template NULLS FIRST
    `
    return rows.map((r) => ({
      agent: r.agent,
      kind: r.kind,
      template: r.template,
      approved: r.approved,
      rejected: r.rejected,
      expired: r.expired,
      medianWaitHours: r.median_wait_hours,
    }))
  }

  async overallMedianWaitHours(htxCode: string, since: Date): Promise<number | null> {
    const rows = await prisma.$queryRaw<{ median: number | null }[]>`
      SELECT (percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (decided_at - created_at)) / 3600))::float8 AS median
      FROM platform.agent_proposals
      WHERE htx_code = ${htxCode} AND created_at >= ${since} AND decided_at IS NOT NULL
    `
    return rows[0]?.median ?? null
  }

  /** Journal decisions in the window; a returned entry counts when its reason is missing information. */
  async journalReview(htxCode: string, since: Date): Promise<JournalReviewStat> {
    const rows = await prisma.$queryRaw<{ reviewed: number; returned: number }[]>`
      SELECT
        count(*) FILTER (WHERE kind IN ('journal.approve', 'journal.reject') AND decided_at IS NOT NULL)::int AS reviewed,
        count(*) FILTER (WHERE kind = 'journal.reject' AND decided_at IS NOT NULL
          AND payload->>'decision' = 'REQUEST_CHANGES' AND payload->>'reason_code' = 'MISSING_INFO')::int AS returned
      FROM platform.agent_proposals
      WHERE htx_code = ${htxCode} AND created_at >= ${since}
    `
    return { reviewed: rows[0]?.reviewed ?? 0, returnedMissingInfo: rows[0]?.returned ?? 0 }
  }

  /** Campaign outcomes of the days from `sinceDay` (Vietnam) on; a day with `actual < target` is a missed day. */
  async campaignGoals(htxCode: string, sinceDay: string): Promise<CampaignGoalStat[]> {
    const rows = await prisma.$queryRaw<{ goal_key: string; days: number; missed_days: number }[]>`
      SELECT o.goal_key, count(*)::int AS days, count(*) FILTER (WHERE o.actual < o.target)::int AS missed_days
      FROM platform.campaign_outcomes o
      JOIN platform.campaigns c ON c.id = o.campaign_id
      WHERE c.htx_code = ${htxCode} AND c.day >= ${sinceDay}::date
      GROUP BY o.goal_key
      ORDER BY o.goal_key
    `
    return rows.map((r) => ({ goalKey: r.goal_key, days: r.days, missedDays: r.missed_days }))
  }
}
