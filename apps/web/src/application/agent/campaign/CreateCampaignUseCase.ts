// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import type { CampaignRepository, CreateCampaignRecord } from '@/domain/agent/ports/CampaignRepository'
import type { CampaignGoal } from '@/domain/agent/campaign'
import type { ProposalRepository } from '@/domain/agent/ports/ProposalRepository'
import { ValidationError } from '@/domain/errors'
import { campaignGoal } from './campaign-goals'

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_ITEMS = 15

/** Body of `POST /api/internal/agent/campaigns` (contract C4). Positions must be 1..n in order. */
export const createCampaignSchema = z
  .object({
    day: z.string().regex(DAY_RE),
    items: z
      .array(z.object({ proposal_id: z.string().uuid(), position: z.number().int() }))
      .min(1)
      .max(MAX_ITEMS),
    dropped: z.array(
      z.object({
        proposal_id: z.string().uuid(),
        rule: z.enum(['withdrawal', 'rain', 'people', 'overflow']),
      })
    ),
    summary_vi: z.string().trim().min(1).max(400),
    run_id: z.string().uuid(),
  })
  .refine((body) => body.items.every((item, index) => item.position === index + 1), {
    message: 'Positions must be 1..n in order',
    path: ['items'],
  })

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>

export interface CreateCampaignDeps {
  campaigns: CampaignRepository
  proposals: Pick<ProposalRepository, 'findById'>
  runOwned(htxCode: string, runId: string): Promise<boolean>
  /** Queues the Telegram message of a new campaign; called once, only when the campaign was created. */
  notify(htxCode: string, campaignId: string): Promise<void>
}

/** Stores A9's campaign after checking it again; the goals come from the proposals, not from the agent (contract C4). */
export class CreateCampaignUseCase {
  constructor(private readonly deps: CreateCampaignDeps) {}

  async execute(htxCode: string, body: CreateCampaignInput): Promise<{ created: boolean; id: string }> {
    if (!(await this.deps.runOwned(htxCode, body.run_id))) {
      throw new ValidationError('INVALID_RUN_ID')
    }

    const seen = new Set<string>()
    const items: CreateCampaignRecord['items'] = []
    const goals: CampaignGoal[] = []
    for (const item of body.items) {
      if (seen.has(item.proposal_id)) throw new ValidationError('INVALID_CAMPAIGN')
      seen.add(item.proposal_id)

      const proposal = await this.deps.proposals.findById(htxCode, item.proposal_id)
      if (!proposal || proposal.status !== 'proposed') throw new ValidationError('INVALID_CAMPAIGN')

      const goal = campaignGoal(proposal)
      items.push({ proposalId: item.proposal_id, position: item.position, goalKey: goal.goalKey, target: goal.target })
      addToGoals(goals, goal)
    }

    const result = await this.deps.campaigns.create({
      htxCode,
      day: body.day,
      summaryVi: body.summary_vi,
      runId: body.run_id,
      goals,
      items,
      dropped: body.dropped.map((d) => ({ proposalId: d.proposal_id, rule: d.rule })),
    })
    if (result.created) await this.deps.notify(htxCode, result.id)
    return { created: result.created, id: result.id }
  }
}

/** Sums the targets of one goal key, keeping the order of first appearance. */
function addToGoals(goals: CampaignGoal[], goal: { goalKey: string; labelVi: string; unitVi: string; target: number }): void {
  const existing = goals.find((g) => g.goalKey === goal.goalKey)
  if (existing) existing.target += goal.target
  else goals.push({ goalKey: goal.goalKey, labelVi: goal.labelVi, unitVi: goal.unitVi, target: goal.target })
}
