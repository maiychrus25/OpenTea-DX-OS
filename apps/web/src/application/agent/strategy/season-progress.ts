// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { quarterRange, type Figures, type GoalDirection, type GoalKey, type StrategyPlan } from '@/domain/agent/strategy'

const DAY_MS = 86_400_000
const REPORT_LINES = 3

/** Goals whose figure adds up over the quarter, so the target is pro-rated; a rate is compared as it stands. */
const CUMULATIVE: readonly GoalKey[] = ['yield_kg', 'shop_revenue_vnd']

export interface SeasonProgressEntry {
  key: GoalKey
  label_vi: string
  direction: GoalDirection
  baseline: number
  target: number
  current: number | null
  pro_rated_target: number
  /** Whole weeks of the quarter that have passed; A10 waits for four before it flags a goal. */
  weeks_elapsed: number
}

/** The adopted plan's goals against the quarter so far (contract C6). Empty without a plan. */
export function seasonProgress(plan: StrategyPlan | null, current: Figures, now: Date): SeasonProgressEntry[] {
  if (!plan) return []
  const { from, to } = quarterRange(plan.season)
  const elapsedMs = Math.min(Math.max(now.getTime() - from.getTime(), 0), to.getTime() - from.getTime())
  const fraction = elapsedMs / (to.getTime() - from.getTime())
  return plan.goals.map((goal) => ({
    key: goal.key,
    label_vi: goal.label_vi,
    direction: goal.direction,
    baseline: goal.baseline,
    target: goal.target,
    current: current[goal.key],
    pro_rated_target: CUMULATIVE.includes(goal.key) ? Math.round(goal.target * fraction * 10) / 10 : goal.target,
    weeks_elapsed: Math.floor(elapsedMs / DAY_MS / 7),
  }))
}

/** The Monday report's season lines: the figure against last year's same quarter, never the plan's own target (contract C6). */
export function seasonReportLines(plan: StrategyPlan | null, current: Figures): string[] {
  if (!plan) return []
  return plan.goals
    .filter((goal) => current[goal.key] !== null)
    .slice(0, REPORT_LINES)
    .map((goal) => `${goal.label_vi}: ${current[goal.key]} (cùng kỳ năm trước: ${goal.baseline})`)
}
