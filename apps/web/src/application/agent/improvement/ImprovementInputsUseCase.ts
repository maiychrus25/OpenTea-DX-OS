// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { AgentSettingsRepository, AgentSettingsValues } from '@/domain/agent/ports/AgentSettingsRepository'
import type { ImprovementEffect, ImprovementRepository } from '@/domain/agent/ports/ImprovementRepository'
import type { ImprovementStatsReader } from '@/domain/agent/ports/ImprovementStatsReader'
import { vnDayOf } from '@/application/agent/campaign/vn-day'
import type { StrategyPlanRepository } from '@/domain/agent/ports/StrategyPlanRepository'
import { seasonOfDay, type Figures } from '@/domain/agent/strategy'
import { seasonProgress, type SeasonProgressEntry } from '@/application/agent/strategy/season-progress'
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
  /** Decided proposals of the window and their median wait: the figure A10's slow-decisions rule and its measurement share. */
  overall: { decided: number; median_wait_hours: number | null }
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
  /** The adopted season plan's goals against the quarter so far (M11); empty without a plan. */
  season_progress: SeasonProgressEntry[]
}

export interface ImprovementInputsDeps {
  improvements: Pick<ImprovementRepository, 'listSince'>
  stats: ImprovementStatsReader
  settings: Pick<AgentSettingsRepository, 'findForEvidence'>
  /** M11: the adopted plan and the figures of its quarter so far. */
  strategy?: { plans: Pick<StrategyPlanRepository, 'adoptedFor'>; figures(htxCode: string, season: string): Promise<Figures> }
}

/** The current value of each `season_goal:<key>` metric of A10's season rule (M11); a goal with no figure has none. */
function seasonGoalMetrics(metricKeys: string[], figures: Figures | null): Record<string, number> {
  const out: Record<string, number> = {}
  for (const metricKey of metricKeys) {
    const value = metricKey.startsWith('season_goal:') && figures ? figures[metricKey.slice(12) as keyof Figures] : null
    if (typeof value === 'number') out[metricKey] = value
  }
  return out
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

    const season = seasonOfDay(vnDayOf(now))
    const plan = this.deps.strategy ? await this.deps.strategy.plans.adoptedFor(htxCode, season) : null
    const seasonFigures = plan && this.deps.strategy ? await this.deps.strategy.figures(htxCode, season) : null

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
      overall: {
        decided: rows.reduce((n, row) => n + row.approved + row.rejected, 0),
        median_wait_hours: medianWaitHours,
      },
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
      metrics: {
        ...computeMetrics(metricKeys, {
        proposalStats: rows,
        journalReview,
        campaignGoals,
        medianWaitHours,
        }),
        ...seasonGoalMetrics(metricKeys, seasonFigures),
      },
      season_progress: plan && seasonFigures ? seasonProgress(plan, seasonFigures, now) : [],
    }
  }
}
