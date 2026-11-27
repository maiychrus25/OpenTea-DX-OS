// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { CreateProposalUseCase } from '@/application/agent/CreateProposalUseCase'
import { EVIDENCE_LOADERS, type EvidenceLoaders } from '@/application/agent/actions/journal-evidence'
import { strategyPlanValues } from '@/application/agent/actions/strategy-evidence'
import { canonicalJson, evidenceDigest, sha256Hex } from '@/domain/agent/evidence'
import type { AutopilotRepository } from '@/domain/agent/ports/AutopilotRepository'
import type { ProposalRepository } from '@/domain/agent/ports/ProposalRepository'
import type { StrategyPlanRepository } from '@/domain/agent/ports/StrategyPlanRepository'
import type { EvidenceRow } from '@/domain/agent/proposal'
import {
  GOAL_DEFS,
  GOAL_KEYS,
  INITIATIVE_KINDS,
  SEASON_PATTERN,
  goalWarnings,
  sameQuarterLastYear,
  type Figures,
  type PlanGoal,
} from '@/domain/agent/strategy'
import { ValidationError } from '@/domain/errors'

const MAX_ITEMS = 5
const MAX_TEXT = 160

/**
 * Body of `POST /api/internal/agent/strategy/plans` (contract C3). A goal's label, unit, direction and baseline are
 * the web's own, so only the key and the target are read from the agent.
 */
export const createStrategyPlanSchema = z.object({
  season: z.string().regex(SEASON_PATTERN),
  goals: z
    .array(z.object({ key: z.enum(GOAL_KEYS), target: z.number().finite().min(0) }))
    .max(GOAL_KEYS.length)
    .refine((goals) => new Set(goals.map((g) => g.key)).size === goals.length, { message: 'Mục tiêu bị lặp' }),
  priorities: z.array(z.string().trim().min(1).max(MAX_TEXT)).max(MAX_ITEMS),
  initiatives: z.array(z.object({ kind: z.enum(INITIATIVE_KINDS), title_vi: z.string().trim().min(1).max(MAX_TEXT) })).max(MAX_ITEMS),
  run_id: z.string().uuid().nullable().optional(),
})

export type CreateStrategyPlanInput = z.infer<typeof createStrategyPlanSchema>

export type CreateStrategyPlanResult = { existing: true } | { existing: false; id: string; proposalId: string }

export interface CreateStrategyPlanDeps {
  plans: Pick<StrategyPlanRepository, 'insertDraftIfNone' | 'remove' | 'linkProposal' | 'findById'>
  proposals: Pick<ProposalRepository, 'create' | 'createdSince'>
  /** The season's figures; the baseline of every goal is last year's same quarter. */
  figures(htxCode: string, season: string): Promise<Figures>
  runOwned(htxCode: string, runId: string): Promise<boolean>
  autopilot?: Pick<AutopilotRepository, 'get'>
  loaders?: EvidenceLoaders
}

/**
 * Stores A11's draft and proposes `strategy.adopt` for it, as an ordinary proposal linked to the row (contract C3).
 * The row and its proposal are not one database transaction, so a proposal that cannot be made removes the row again.
 */
export class CreateStrategyPlanUseCase {
  constructor(private readonly deps: CreateStrategyPlanDeps) {}

  async execute(htxCode: string, body: CreateStrategyPlanInput): Promise<CreateStrategyPlanResult> {
    if (body.run_id && !(await this.deps.runOwned(htxCode, body.run_id))) throw new ValidationError('INVALID_RUN_ID')

    const lastYear = await this.deps.figures(htxCode, sameQuarterLastYear(body.season))
    const goals: PlanGoal[] = body.goals.map((goal) => {
      const baseline = lastYear[goal.key]
      if (baseline === null) throw new ValidationError('INVALID_GOAL')
      const def = GOAL_DEFS[goal.key]
      return { key: goal.key, label_vi: def.labelVi, unit_vi: def.unitVi, baseline, target: goal.target, direction: def.direction }
    })

    const stored = await this.deps.plans.insertDraftIfNone({
      htxCode,
      season: body.season,
      goals,
      priorities: body.priorities,
      initiatives: body.initiatives,
      warnings: goalWarnings(goals),
      runId: body.run_id ?? null,
    })
    if (!stored) return { existing: true }

    try {
      const plan = await this.deps.plans.findById(htxCode, stored.id)
      if (!plan) throw new ValidationError('INVALID_EVIDENCE')
      const values = strategyPlanValues(plan)
      const row: EvidenceRow = { table: 'strategy_plans', id: plan.id, sha256: sha256Hex(canonicalJson(values)), values }
      const created = await new CreateProposalUseCase(
        this.deps.proposals,
        this.deps.loaders ?? EVIDENCE_LOADERS,
        this.deps.autopilot
      ).execute({
        htxCode,
        runId: body.run_id ?? null,
        agent: 'strategy',
        kind: 'strategy.adopt',
        payload: { plan_id: plan.id },
        reasonVi: `Kế hoạch mùa vụ ${body.season}, đặt từ số liệu cùng kỳ năm trước`,
        evidence: { rows: [row], sha256: evidenceDigest([row]) },
        origin: 'agent',
      })
      if (!created) throw new ValidationError('INVALID_PROPOSAL')
      await this.deps.plans.linkProposal(htxCode, plan.id, created.id)
      return { existing: false, id: plan.id, proposalId: created.id }
    } catch (err) {
      await this.deps.plans.remove(htxCode, stored.id)
      throw err
    }
  }
}
