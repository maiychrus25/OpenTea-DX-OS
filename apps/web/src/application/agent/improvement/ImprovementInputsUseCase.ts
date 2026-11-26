// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { AgentSettingsRepository, AgentSettingsValues } from '@/domain/agent/ports/AgentSettingsRepository'
import type { ImprovementEffect, ImprovementRepository } from '@/domain/agent/ports/ImprovementRepository'
import type { ImprovementStatsReader } from '@/domain/agent/ports/ImprovementStatsReader'
import { vnDayOf } from '@/application/agent/campaign/vn-day'
import { computeMetrics } from './improvement-metrics'

const DAY_MS = 86_400_000
const PROPOSAL_WINDOW_DAYS = 28
const CAMPAIGN_WINDOW_DAYS = 14
const IMPROVEMENT_WINDOW_WEEKS = 8
/** The agents whose thresholds and schedule A10 may read (contract C2). */
const SETTING_AGENTS = ['field-watch', 'disease-watch', 'harvest-ready', 'digest'] as const

export interface ImprovementInputs {
  week: string
  settings: Record<string, AgentSettingsValues>
  proposal_stats: {
    agent: string
    kind: string
    template: string | null
    window_days: number
    approved: number
    rejected: number
    expired: number
    median_wait_hours: number | null
  }[]
  journal_review: { window_days: number; reviewed: number; returned_missing_info: number }
  campaign_goals: { goal_key: string; days: number; missed_days: number }[]
  improvements: {
    id: string
    kind: string
    metric_key: string
    status: string
    baseline: number
    adopted_at: string | null
    effect: ImprovementEffect
  }[]
  metrics: Record<string, number>
}

export interface ImprovementInputsDeps {
  improvements: Pick<ImprovementRepository, 'listSince'>
  stats: ImprovementStatsReader
  settings: Pick<AgentSettingsRepository, 'findForEvidence'>
}

/** Builds the figures A10 reads for a week (contract C3). Every figure is scoped to the cooperative. */
export class ImprovementInputsUseCase {
  constructor(private readonly deps: ImprovementInputsDeps) {}

  async execute(htxCode: string, week: string, now: Date = new Date()): Promise<ImprovementInputs> {
    const proposalSince = new Date(now.getTime() - PROPOSAL_WINDOW_DAYS * DAY_MS)
    const [rows, medianWaitHours, journalReview, campaignGoals, improvements] = await Promise.all([
      this.deps.stats.proposalStats(htxCode, proposalSince),
      this.deps.stats.overallMedianWaitHours(htxCode, proposalSince),
      this.deps.stats.journalReview(htxCode, proposalSince),
      this.deps.stats.campaignGoals(htxCode, vnDayOf(new Date(now.getTime() - CAMPAIGN_WINDOW_DAYS * DAY_MS))),
      this.deps.improvements.listSince(htxCode, vnDayOf(new Date(now.getTime() - IMPROVEMENT_WINDOW_WEEKS * 7 * DAY_MS))),
    ])

    const settings: Record<string, AgentSettingsValues> = {}
    for (const agent of SETTING_AGENTS) {
      const values = await this.deps.settings.findForEvidence(htxCode, agent)
      if (values) settings[agent] = values
    }

    const metricKeys = Array.from(new Set(improvements.map((i) => i.metricKey)))
    return {
      week,
      settings,
      proposal_stats: rows.map((row) => ({
        agent: row.agent,
        kind: row.kind,
        template: row.template,
        window_days: PROPOSAL_WINDOW_DAYS,
        approved: row.approved,
        rejected: row.rejected,
        expired: row.expired,
        median_wait_hours: row.medianWaitHours,
      })),
      journal_review: {
        window_days: PROPOSAL_WINDOW_DAYS,
        reviewed: journalReview.reviewed,
        returned_missing_info: journalReview.returnedMissingInfo,
      },
      campaign_goals: campaignGoals.map((goal) => ({ goal_key: goal.goalKey, days: goal.days, missed_days: goal.missedDays })),
      improvements: improvements.map((i) => ({
        id: i.id,
        kind: i.kind,
        metric_key: i.metricKey,
        status: i.status,
        baseline: i.baseline,
        adopted_at: i.adoptedAt ? i.adoptedAt.toISOString() : null,
        effect: i.effect,
      })),
      metrics: computeMetrics(metricKeys, {
        proposalStats: rows,
        journalReview,
        campaignGoals,
        medianWaitHours,
      }),
    }
  }
}
