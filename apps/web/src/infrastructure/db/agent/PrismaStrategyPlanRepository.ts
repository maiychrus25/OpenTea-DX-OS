// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { Prisma } from '@prisma/client'
import type { AdoptResult, NewStrategyPlan, StrategyPlanRepository } from '@/domain/agent/ports/StrategyPlanRepository'
import type { PlanGoal, PlanInitiative, PlanStatus, StrategyPlan } from '@/domain/agent/strategy'
import { prisma } from '@/infrastructure/db/prisma.client'

type PlanRow = {
  id: string
  htx_code: string
  season: string
  goals: PlanGoal[]
  priorities: string[]
  initiatives: PlanInitiative[]
  warnings: string[]
  status: PlanStatus
  proposal_id: string | null
  adopted_by: string | null
  adopted_at: Date | null
  run_id: string | null
  created_at: Date
}

const PLAN_COLUMNS = `id::text AS id, htx_code, season, goals, priorities, initiatives, warnings, status,
  proposal_id::text AS proposal_id, adopted_by, adopted_at, run_id::text AS run_id, created_at`

const AGENT_ACTOR = 'agent:strategy'

function mapPlan(r: PlanRow): StrategyPlan {
  return {
    id: r.id,
    htxCode: r.htx_code,
    season: r.season,
    goals: r.goals,
    priorities: r.priorities,
    initiatives: r.initiatives,
    warnings: r.warnings,
    status: r.status,
    proposalId: r.proposal_id,
    adoptedBy: r.adopted_by,
    adoptedAt: r.adopted_at,
    runId: r.run_id,
    createdAt: r.created_at,
  }
}

/** Persistence adapter for `platform.strategy_plans`; every read and write is scoped by cooperative. */
export class PrismaStrategyPlanRepository implements StrategyPlanRepository {
  /** Every write names its audit actor, as the M7 and M8 writes do. */
  private write<T>(actor: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('dxos.actor', ${actor}, true)`
      return fn(tx)
    })
  }

  async insertDraftIfNone(input: NewStrategyPlan): Promise<{ id: string } | null> {
    return this.write(AGENT_ACTOR, async (tx) => {
      const inserted = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO platform.strategy_plans (htx_code, season, goals, priorities, initiatives, warnings, run_id)
        VALUES (${input.htxCode}, ${input.season}, ${JSON.stringify(input.goals)}::jsonb,
                ${JSON.stringify(input.priorities)}::jsonb, ${JSON.stringify(input.initiatives)}::jsonb,
                ${JSON.stringify(input.warnings)}::jsonb, ${input.runId}::uuid)
        ON CONFLICT (htx_code, season) WHERE status = 'draft' DO NOTHING
        RETURNING id::text AS id
      `
      return inserted[0] ?? null
    })
  }

  async remove(htxCode: string, id: string): Promise<void> {
    await this.write(AGENT_ACTOR, (tx) => tx.$executeRaw`
      DELETE FROM platform.strategy_plans
      WHERE htx_code = ${htxCode} AND id = ${id}::uuid AND proposal_id IS NULL
    `)
  }

  async linkProposal(htxCode: string, id: string, proposalId: string): Promise<void> {
    await this.write(AGENT_ACTOR, (tx) => tx.$executeRaw`
      UPDATE platform.strategy_plans SET proposal_id = ${proposalId}::uuid
      WHERE htx_code = ${htxCode} AND id = ${id}::uuid
    `)
  }

  async findById(htxCode: string, id: string): Promise<StrategyPlan | null> {
    const rows = await prisma.$queryRaw<PlanRow[]>`
      SELECT ${Prisma.raw(PLAN_COLUMNS)} FROM platform.strategy_plans
      WHERE htx_code = ${htxCode} AND id = ${id}::uuid
    `
    return rows[0] ? mapPlan(rows[0]) : null
  }

  async draftExists(htxCode: string, season: string): Promise<boolean> {
    const rows = await prisma.$queryRaw<{ found: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM platform.strategy_plans WHERE htx_code = ${htxCode} AND season = ${season} AND status = 'draft'
      ) AS found
    `
    return rows[0]?.found === true
  }

  async adoptedFor(htxCode: string, season: string): Promise<StrategyPlan | null> {
    const rows = await prisma.$queryRaw<PlanRow[]>`
      SELECT ${Prisma.raw(PLAN_COLUMNS)} FROM platform.strategy_plans
      WHERE htx_code = ${htxCode} AND season = ${season} AND status = 'adopted'
      ORDER BY adopted_at DESC LIMIT 1
    `
    return rows[0] ? mapPlan(rows[0]) : null
  }

  async adopt(htxCode: string, id: string, decidedBy: string, at: Date): Promise<AdoptResult> {
    return this.write(`user:${decidedBy}`, async (tx) => {
      const found = await tx.$queryRaw<{ season: string; status: PlanStatus }[]>`
        SELECT season, status FROM platform.strategy_plans
        WHERE htx_code = ${htxCode} AND id = ${id}::uuid FOR UPDATE
      `
      if (!found[0]) return 'not_found'
      if (found[0].status !== 'draft') return 'not_draft'
      await tx.$executeRaw`
        UPDATE platform.strategy_plans SET status = 'superseded'
        WHERE htx_code = ${htxCode} AND season = ${found[0].season} AND status = 'adopted'
      `
      await tx.$executeRaw`
        UPDATE platform.strategy_plans SET status = 'adopted', adopted_by = ${decidedBy}, adopted_at = ${at}
        WHERE htx_code = ${htxCode} AND id = ${id}::uuid
      `
      const details = { actor: `user:${decidedBy}`, htx_code: htxCode, season: found[0].season }
      await tx.$executeRaw`
        SELECT audit.record_event('web', 'strategy.adopted', ${id}, ${JSON.stringify(details)}::jsonb)
      `
      return 'adopted'
    })
  }
}
