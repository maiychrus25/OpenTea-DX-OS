// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { Prisma } from '@prisma/client'
import type {
  EffectAfter,
  EffectResult,
  EffectVerdict,
  Improvement,
  ImprovementEffect,
  ImprovementRepository,
  ImprovementSettlement,
  ImprovementStatus,
  NewImprovement,
} from '@/domain/agent/ports/ImprovementRepository'
import { prisma } from '@/infrastructure/db/prisma.client'

type ImprovementRow = {
  id: string
  htx_code: string
  week: string
  kind: Improvement['kind']
  metric_key: string
  title_vi: string
  rationale_vi: string
  baseline: number
  evidence: Record<string, unknown>
  proposal_id: string | null
  status: ImprovementStatus
  decided_by: string | null
  adopted_at: Date | null
  effect: ImprovementEffect
  template: Improvement['template']
  created_at: Date
}

const IMPROVEMENT_COLUMNS = `id::text AS id, htx_code, to_char(week, 'YYYY-MM-DD') AS week, kind, metric_key, title_vi,
  rationale_vi, baseline::float8 AS baseline, evidence, proposal_id::text AS proposal_id, status, decided_by, adopted_at,
  effect, template, created_at`

const AGENT_ACTOR = 'agent:improvement'

function mapImprovement(r: ImprovementRow): Improvement {
  return {
    id: r.id,
    htxCode: r.htx_code,
    week: r.week,
    kind: r.kind,
    metricKey: r.metric_key,
    titleVi: r.title_vi,
    rationaleVi: r.rationale_vi,
    baseline: r.baseline,
    evidence: r.evidence,
    proposalId: r.proposal_id,
    status: r.status,
    decidedBy: r.decided_by,
    adoptedAt: r.adopted_at,
    effect: r.effect ?? {},
    template: r.template,
    createdAt: r.created_at,
  }
}

/** Persistence adapter for `platform.improvements`; every read and write is scoped by cooperative. */
export class PrismaImprovementRepository implements ImprovementRepository {
  /** Every write names its audit actor, as the M7 campaign writes do. */
  private write<T>(actor: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('dxos.actor', ${actor}, true)`
      return fn(tx)
    })
  }

  async insertIfNew(input: NewImprovement): Promise<{ id: string } | null> {
    return this.write(AGENT_ACTOR, async (tx) => {
      const inserted = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO platform.improvements (htx_code, week, kind, metric_key, title_vi, rationale_vi, baseline, evidence, template)
        VALUES (${input.htxCode}, ${input.week}::date, ${input.kind}, ${input.metricKey}, ${input.titleVi},
                ${input.rationaleVi}, ${input.baseline}, ${JSON.stringify(input.evidence)}::jsonb,
                ${input.template ? JSON.stringify(input.template) : null}::jsonb)
        ON CONFLICT (htx_code, week, metric_key) DO NOTHING
        RETURNING id::text AS id
      `
      return inserted[0] ?? null
    })
  }

  async remove(htxCode: string, id: string): Promise<void> {
    await this.write(AGENT_ACTOR, (tx) => tx.$executeRaw`
      DELETE FROM platform.improvements
      WHERE htx_code = ${htxCode} AND id = ${id}::uuid AND proposal_id IS NULL
    `)
  }

  async linkProposal(htxCode: string, id: string, proposalId: string): Promise<void> {
    await this.write(AGENT_ACTOR, (tx) => tx.$executeRaw`
      UPDATE platform.improvements SET proposal_id = ${proposalId}::uuid
      WHERE htx_code = ${htxCode} AND id = ${id}::uuid
    `)
  }

  async findById(htxCode: string, id: string): Promise<Improvement | null> {
    const rows = await prisma.$queryRaw<ImprovementRow[]>`
      SELECT ${Prisma.raw(IMPROVEMENT_COLUMNS)} FROM platform.improvements
      WHERE htx_code = ${htxCode} AND id = ${id}::uuid
    `
    return rows[0] ? mapImprovement(rows[0]) : null
  }

  async listSince(htxCode: string, since: string): Promise<Improvement[]> {
    const rows = await prisma.$queryRaw<ImprovementRow[]>`
      SELECT ${Prisma.raw(IMPROVEMENT_COLUMNS)} FROM platform.improvements
      WHERE htx_code = ${htxCode} AND week >= ${since}::date
      ORDER BY week DESC, created_at DESC
    `
    return rows.map(mapImprovement)
  }

  async settleProposal(htxCode: string, proposalId: string, settlement: ImprovementSettlement): Promise<void> {
    await this.write(`user:${settlement.decidedBy}`, (tx) => {
      if (settlement.status === 'adopted') {
        return tx.$executeRaw`
          UPDATE platform.improvements
          SET status = 'adopted', decided_by = ${settlement.decidedBy}, adopted_at = ${settlement.adoptedAt}
          WHERE htx_code = ${htxCode} AND proposal_id = ${proposalId}::uuid AND status = 'proposed'
        `
      }
      return tx.$executeRaw`
        UPDATE platform.improvements SET status = 'declined', decided_by = ${settlement.decidedBy}
        WHERE htx_code = ${htxCode} AND proposal_id = ${proposalId}::uuid AND status = 'proposed'
      `
    })
  }

  async recordEffect(
    htxCode: string,
    id: string,
    after: EffectAfter,
    entry: { value: number; verdict: EffectVerdict; at: Date }
  ): Promise<EffectResult> {
    const current = await this.findById(htxCode, id)
    if (!current) return 'not_found'
    const key = `after_${after}`
    const value = JSON.stringify({ value: entry.value, verdict: entry.verdict, at: entry.at.toISOString() })
    const updated = await this.write(AGENT_ACTOR, (tx) => tx.$queryRaw<{ id: string }[]>`
      UPDATE platform.improvements
      SET effect = effect || jsonb_build_object(${key}::text, ${value}::jsonb),
          status = CASE WHEN ${after} = '4w' THEN 'measured' ELSE status END
      WHERE htx_code = ${htxCode} AND id = ${id}::uuid AND status = 'adopted' AND NOT (effect ? ${key}::text)
      RETURNING id::text AS id
    `)
    return updated.length ? 'ok' : 'conflict'
  }

  async activeTemplates(htxCode: string, weekday: number): Promise<Improvement[]> {
    const rows = await prisma.$queryRaw<ImprovementRow[]>`
      SELECT ${Prisma.raw(IMPROVEMENT_COLUMNS)} FROM platform.improvements
      WHERE htx_code = ${htxCode} AND kind = 'template' AND status IN ('adopted', 'measured')
        AND (template->>'weekday')::int = ${weekday}
        AND COALESCE(effect->'after_2w'->>'verdict' <> 'drop', true) AND COALESCE(effect->'after_4w'->>'verdict' <> 'drop', true)
      ORDER BY adopted_at ASC
    `
    return rows.map(mapImprovement)
  }

  async measuredBetween(htxCode: string, from: Date, to: Date): Promise<Improvement[]> {
    const rows = await prisma.$queryRaw<ImprovementRow[]>`
      SELECT ${Prisma.raw(IMPROVEMENT_COLUMNS)} FROM platform.improvements
      WHERE htx_code = ${htxCode}
        AND ((effect->'after_2w'->>'at')::timestamptz BETWEEN ${from} AND ${to}
          OR (effect->'after_4w'->>'at')::timestamptz BETWEEN ${from} AND ${to})
      ORDER BY created_at ASC
    `
    return rows.map(mapImprovement)
  }

  async countForWeek(htxCode: string, week: string): Promise<number> {
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM platform.improvements WHERE htx_code = ${htxCode} AND week = ${week}::date
    `
    return Number(rows[0]?.n ?? 0)
  }
}
