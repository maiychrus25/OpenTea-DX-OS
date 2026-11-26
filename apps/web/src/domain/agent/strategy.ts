// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export const GOAL_KEYS = ['yield_kg', 'journal_on_time_rate', 'diseased_parcel_rate', 'shop_revenue_vnd'] as const
export type GoalKey = (typeof GOAL_KEYS)[number]
export type GoalDirection = 'up' | 'down'

/** What a goal is called and which way is better; the figures themselves come from `seasonFigures`. */
export const GOAL_DEFS: Readonly<Record<GoalKey, { labelVi: string; unitVi: string; direction: GoalDirection }>> = {
  yield_kg: { labelVi: 'Sản lượng', unitVi: 'kg', direction: 'up' },
  journal_on_time_rate: { labelVi: 'Nhật ký đúng hạn', unitVi: '%', direction: 'up' },
  diseased_parcel_rate: { labelVi: 'Thửa có bệnh', unitVi: '%', direction: 'down' },
  shop_revenue_vnd: { labelVi: 'Doanh thu cửa hàng', unitVi: 'đồng', direction: 'up' },
}

export type Figures = Record<GoalKey, number | null>

export const INITIATIVE_KINDS = ['miniapp', 'training', 'partner', 'expand', 'outside'] as const
export type InitiativeKind = (typeof INITIATIVE_KINDS)[number]

export interface PlanGoal {
  key: GoalKey
  label_vi: string
  unit_vi: string
  baseline: number
  target: number
  direction: GoalDirection
}

export interface PlanInitiative {
  kind: InitiativeKind
  title_vi: string
}

export type PlanStatus = 'draft' | 'adopted' | 'superseded'

export interface StrategyPlan {
  id: string
  htxCode: string
  season: string
  goals: PlanGoal[]
  priorities: string[]
  initiatives: PlanInitiative[]
  warnings: string[]
  status: PlanStatus
  proposalId: string | null
  adoptedBy: string | null
  adoptedAt: Date | null
  runId: string | null
  createdAt: Date
}

export const SEASON_PATTERN = /^[0-9]{4}-Q[1-4]$/
const VN_OFFSET = '+07:00'

/** The quarter (`YYYY-Qn`) of a Vietnam calendar day (`YYYY-MM-DD`). */
export function seasonOfDay(day: string): string {
  return `${day.slice(0, 4)}-Q${Math.floor((Number(day.slice(5, 7)) - 1) / 3) + 1}`
}

export function previousSeason(season: string): string {
  const year = Number(season.slice(0, 4))
  const quarter = Number(season.slice(6))
  return quarter === 1 ? `${year - 1}-Q4` : `${year}-Q${quarter - 1}`
}

export function sameQuarterLastYear(season: string): string {
  return `${Number(season.slice(0, 4)) - 1}${season.slice(4)}`
}

/** The quarter as instants: from Vietnam midnight of its first day, up to (not including) the next quarter's. */
export function quarterRange(season: string): { from: Date; to: Date } {
  const year = Number(season.slice(0, 4))
  const quarter = Number(season.slice(6))
  const month = (n: number) => String(n).padStart(2, '0')
  const from = new Date(`${year}-${month((quarter - 1) * 3 + 1)}-01T00:00:00${VN_OFFSET}`)
  const to =
    quarter === 4
      ? new Date(`${year + 1}-01-01T00:00:00${VN_OFFSET}`)
      : new Date(`${year}-${month(quarter * 3 + 1)}-01T00:00:00${VN_OFFSET}`)
  return { from, to }
}

/** True when `target` is worse than `baseline` in the goal's direction. */
export function isBelowLastYear(goal: Pick<PlanGoal, 'baseline' | 'target' | 'direction'>): boolean {
  return goal.direction === 'up' ? goal.target < goal.baseline : goal.target > goal.baseline
}

/** One warning per goal whose target is worse than last year's same quarter (test 37 reads these). */
export function goalWarnings(goals: readonly PlanGoal[]): string[] {
  return goals.filter(isBelowLastYear).map((goal) => `Mục tiêu ${goal.label_vi} thấp hơn cùng kỳ năm trước`)
}
