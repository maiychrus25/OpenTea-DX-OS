// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { Prisma } from '@prisma/client'
import type { CampaignRepository, CampaignOutcome, CreateCampaignRecord, CampaignDecider } from '@/domain/agent/ports/CampaignRepository'
import type { Campaign, CampaignGoal, CampaignItem, CampaignStatus } from '@/domain/agent/campaign'
import type { ProposalStatus, Risk } from '@/domain/agent/proposal'
import { prisma } from '@/infrastructure/db/prisma.client'

type CampaignRow = {
  id: string
  htx_code: string
  day: string
  status: CampaignStatus
  goals: { goal_key: string; label_vi: string; unit_vi: string; target: number }[]
  summary_vi: string
  run_id: string | null
  decided_by: string | null
  decided_by_name: string | null
  decided_at: Date | null
  telegram_sent: boolean
  created_at: Date
}

const CAMPAIGN_COLUMNS = `id::text AS id, htx_code, to_char(day, 'YYYY-MM-DD') AS day, status, goals, summary_vi,
  run_id::text AS run_id, decided_by, decided_by_name, decided_at, telegram_sent, created_at`

function mapCampaign(r: CampaignRow): Campaign {
  return {
    id: r.id,
    htxCode: r.htx_code,
    day: r.day,
    status: r.status,
    goals: r.goals.map((g): CampaignGoal => ({ goalKey: g.goal_key, labelVi: g.label_vi, unitVi: g.unit_vi, target: g.target })),
    summaryVi: r.summary_vi,
    runId: r.run_id,
    decidedBy: r.decided_by,
    decidedByName: r.decided_by_name,
    decidedAt: r.decided_at,
    telegramSent: r.telegram_sent,
    createdAt: r.created_at,
  }
}

const AGENT_ACTOR = 'agent:daily-campaign'

/** Persistence adapter for `platform.campaigns`, `campaign_items` and `campaign_outcomes`; every read and write is scoped by cooperative. */
export class PrismaCampaignRepository implements CampaignRepository {
  async create(input: CreateCampaignRecord): Promise<{ id: string; created: boolean }> {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('dxos.actor', ${AGENT_ACTOR}, true)`
      const goals = input.goals.map((g) => ({ goal_key: g.goalKey, label_vi: g.labelVi, unit_vi: g.unitVi, target: g.target }))
      const inserted = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO platform.campaigns (htx_code, day, summary_vi, goals, run_id)
        VALUES (${input.htxCode}, ${input.day}::date, ${input.summaryVi}, ${JSON.stringify(goals)}::jsonb, ${input.runId}::uuid)
        ON CONFLICT (htx_code, day) DO NOTHING
        RETURNING id::text AS id
      `
      if (!inserted.length) {
        const existing = await tx.$queryRaw<{ id: string }[]>`
          SELECT id::text AS id FROM platform.campaigns WHERE htx_code = ${input.htxCode} AND day = ${input.day}::date
        `
        return { id: existing[0].id, created: false }
      }
      const id = inserted[0].id
      for (const item of input.items) {
        await tx.$executeRaw`
          INSERT INTO platform.campaign_items (campaign_id, proposal_id, position, goal_key, target)
          VALUES (${id}::uuid, ${item.proposalId}::uuid, ${item.position}, ${item.goalKey}, ${item.target})
        `
      }
      const details = {
        actor: AGENT_ACTOR,
        day: input.day,
        items: input.items.map((i) => ({ proposal_id: i.proposalId, position: i.position, goal_key: i.goalKey, target: i.target })),
        dropped: input.dropped.map((d) => ({ proposal_id: d.proposalId, rule: d.rule })),
      }
      await tx.$executeRaw`
        SELECT audit.record_event('web', 'agent.campaign.created', ${id}, ${JSON.stringify(details)}::jsonb)
      `
      return { id, created: true }
    })
  }

  async findForDay(htxCode: string, day: string): Promise<Campaign | null> {
    const rows = await prisma.$queryRaw<CampaignRow[]>`
      SELECT ${Prisma.raw(CAMPAIGN_COLUMNS)} FROM platform.campaigns
      WHERE htx_code = ${htxCode} AND day = ${day}::date
      LIMIT 1
    `
    return rows[0] ? mapCampaign(rows[0]) : null
  }

  async findById(htxCode: string, id: string): Promise<Campaign | null> {
    const rows = await prisma.$queryRaw<CampaignRow[]>`
      SELECT ${Prisma.raw(CAMPAIGN_COLUMNS)} FROM platform.campaigns
      WHERE id = ${id}::uuid AND htx_code = ${htxCode}
      LIMIT 1
    `
    return rows[0] ? mapCampaign(rows[0]) : null
  }

  async items(htxCode: string, campaignId: string): Promise<CampaignItem[]> {
    const rows = await prisma.$queryRaw<
      { campaign_id: string; proposal_id: string; position: number; goal_key: string; target: number; kind: string; risk: Risk; proposal_status: ProposalStatus; run_at: Date | null }[]
    >`
      SELECT ci.campaign_id::text AS campaign_id, ci.proposal_id::text AS proposal_id, ci.position, ci.goal_key, ci.target,
             p.kind, p.risk, p.status AS proposal_status, p.run_at
      FROM platform.campaign_items ci
      JOIN platform.campaigns c ON c.id = ci.campaign_id
      JOIN platform.agent_proposals p ON p.id = ci.proposal_id
      WHERE ci.campaign_id = ${campaignId}::uuid AND c.htx_code = ${htxCode}
      ORDER BY ci.position
    `
    return rows.map((r) => ({
      campaignId: r.campaign_id,
      proposalId: r.proposal_id,
      position: r.position,
      goalKey: r.goal_key,
      target: r.target,
      kind: r.kind,
      risk: r.risk,
      proposalStatus: r.proposal_status,
      runAt: r.run_at,
    }))
  }

  async setStatus(
    htxCode: string,
    campaignId: string,
    transition: {
      to: CampaignStatus
      from: readonly CampaignStatus[]
      decidedBy?: CampaignDecider
      event: { op: string; details: Record<string, unknown> }
    }
  ): Promise<boolean> {
    const decider = transition.decidedBy
    const actor = decider ? `user:${decider.userId}` : 'system:web'
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('dxos.actor', ${actor}, true)`
      const rows = await tx.$queryRaw<{ id: string }[]>`
        UPDATE platform.campaigns
        SET status = ${transition.to},
            decided_by = COALESCE(${decider?.userId ?? null}::text, decided_by),
            decided_by_name = COALESCE(${decider?.userName ?? null}::text, decided_by_name),
            decided_at = CASE WHEN ${decider ? true : false}::boolean THEN now() ELSE decided_at END
        WHERE id = ${campaignId}::uuid AND htx_code = ${htxCode} AND status = ANY(${[...transition.from]}::text[])
        RETURNING id::text AS id
      `
      if (!rows.length) return false
      const details = { actor, ...transition.event.details, status: transition.to }
      await tx.$executeRaw`
        SELECT audit.record_event('web', ${transition.event.op}, ${campaignId}, ${JSON.stringify(details)}::jsonb)
      `
      return true
    })
  }

  async itemOfDraftCampaign(htxCode: string, proposalId: string): Promise<{ id: string } | null> {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT c.id::text AS id
      FROM platform.campaigns c
      JOIN platform.campaign_items ci ON ci.campaign_id = c.id
      WHERE c.htx_code = ${htxCode} AND c.status = 'draft' AND ci.proposal_id = ${proposalId}::uuid
      LIMIT 1
    `
    return rows[0] ?? null
  }

  async writeOutcomes(htxCode: string, campaignId: string, outcomes: CampaignOutcome[]): Promise<void> {
    await prisma.$transaction(async (tx) => {
      for (const outcome of outcomes) {
        await tx.$executeRaw`
          INSERT INTO platform.campaign_outcomes (campaign_id, goal_key, target, actual)
          SELECT c.id, ${outcome.goalKey}, ${outcome.target}, ${outcome.actual}
          FROM platform.campaigns c
          WHERE c.id = ${campaignId}::uuid AND c.htx_code = ${htxCode}
          ON CONFLICT (campaign_id, goal_key)
          DO UPDATE SET target = EXCLUDED.target, actual = EXCLUDED.actual, measured_at = now()
        `
      }
    })
  }

  async markTelegramSent(htxCode: string, campaignId: string): Promise<void> {
    await prisma.$executeRaw`
      UPDATE platform.campaigns SET telegram_sent = true
      WHERE id = ${campaignId}::uuid AND htx_code = ${htxCode}
    `
  }
}
