// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { StrategyPlan } from '@/domain/agent/strategy'

/**
 * Evidence values of a plan row. Canonical JSON hashes only integers, so a goal's baseline and target (which may
 * have a decimal) are written as strings. The status is included: an adopted plan makes the open proposal stale.
 */
export function strategyPlanValues(plan: StrategyPlan): Record<string, unknown> {
  return {
    id: plan.id,
    season: plan.season,
    status: plan.status,
    goals: plan.goals.map((goal) => ({
      key: goal.key,
      label_vi: goal.label_vi,
      unit_vi: goal.unit_vi,
      direction: goal.direction,
      baseline: String(goal.baseline),
      target: String(goal.target),
    })),
    priorities: plan.priorities,
    initiatives: plan.initiatives,
    warnings: plan.warnings,
  }
}
