// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { Prisma } from '@prisma/client'
import type {
  CreateProposalRecord,
  ProposalDecisionRecord,
  ProposalFilter,
  ProposalRepository,
} from '@/domain/agent/ports/ProposalRepository'
import type {
  DecisionChannel,
  Evidence,
  Origin,
  Proposal,
  ProposalStatus,
  Risk,
} from '@/domain/agent/proposal'
import { prisma } from '@/infrastructure/db/prisma.client'

type ProposalRow = {
  id: string
  htx_code: string
  run_id: string | null
  agent: string
  kind: string
  payload: Record<string, unknown>
  reason_vi: string
  evidence: Evidence
  confidence: number | null
  risk: Risk
  status: ProposalStatus
  origin: Origin
  requested_by: string | null
  dedupe_key: string
  created_at: Date
  expires_at: Date
  decided_by: string | null
  decided_by_name: string | null
  decided_at: Date | null
  decision_channel: DecisionChannel | null
  decision_note: string | null
  edited_payload: Record<string, unknown> | null
  executed_at: Date | null
  result: Record<string, unknown> | null
}

function mapProposal(r: ProposalRow): Proposal {
  return {
    id: r.id,
    htxCode: r.htx_code,
    runId: r.run_id,
    agent: r.agent,
    kind: r.kind,
    payload: r.payload,
    reasonVi: r.reason_vi,
    evidence: r.evidence,
    confidence: r.confidence,
    risk: r.risk,
    status: r.status,
    origin: r.origin,
    requestedBy: r.requested_by,
    dedupeKey: r.dedupe_key,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    decidedBy: r.decided_by,
    decidedByName: r.decided_by_name,
    decidedAt: r.decided_at,
    decisionChannel: r.decision_channel,
    decisionNote: r.decision_note,
    editedPayload: r.edited_payload,
    executedAt: r.executed_at,
    result: r.result,
  }
}

function truncateText(value: string, maxLen = 500): string {
  return value.length <= maxLen ? value : `${value.slice(0, maxLen - 3)}...`
}

/** Persistence adapter for `platform.agent_proposals` using parameterized raw queries and audit events. */
export class PrismaProposalRepository implements ProposalRepository {
  async create(input: CreateProposalRecord): Promise<{ id: string } | null> {
    const actor = input.requestedBy ? `user:${input.requestedBy}` : `agent:${input.agent}`
    const isJournal = input.kind.startsWith('journal.')
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('dxos.actor', ${actor}, true)`
      // One creation at a time per cooperative, so the subject check below cannot race with another insert.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.htxCode}))`

      const overdue = await tx.$queryRaw<{ id: string }[]>`
        UPDATE platform.agent_proposals
        SET status = 'expired'
        WHERE htx_code = ${input.htxCode}
          AND status = 'proposed'
          AND expires_at <= now()
          AND ((kind = ${input.kind} AND dedupe_key = ${input.dedupeKey})
            OR (${isJournal}::boolean AND kind LIKE 'journal.%' AND subject_ids && ${input.subjects}::text[]))
        RETURNING id::text AS id
      `
      for (const row of overdue) {
        await tx.$executeRaw`
          SELECT audit.record_event('web', 'agent.proposal.expired', ${row.id}, ${JSON.stringify({ actor })}::jsonb)
        `
      }

      const rows = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO platform.agent_proposals (
          htx_code, run_id, agent, kind, payload, reason_vi, evidence, confidence,
          risk, origin, requested_by, dedupe_key, expires_at, subject_ids
        )
        SELECT
          ${input.htxCode}, ${input.runId}::uuid, ${input.agent}, ${input.kind},
          ${JSON.stringify(input.payload)}::jsonb, ${input.reasonVi},
          ${JSON.stringify(input.evidence)}::jsonb, ${input.confidence},
          ${input.risk}, ${input.origin}, ${input.requestedBy},
          ${input.dedupeKey}, ${input.expiresAt}, ${input.subjects}::text[]
        WHERE NOT (${isJournal}::boolean AND EXISTS (
          SELECT 1 FROM platform.agent_proposals
          WHERE htx_code = ${input.htxCode}
            AND status IN ('proposed', 'approved')
            AND kind LIKE 'journal.%'
            AND subject_ids && ${input.subjects}::text[]
        ))
        ON CONFLICT (htx_code, kind, dedupe_key) WHERE status IN ('proposed', 'approved')
        DO NOTHING
        RETURNING id::text AS id
      `
      if (!rows.length) return null
      const id = rows[0].id
      const details = {
        actor,
        htx_code: input.htxCode,
        agent: input.agent,
        kind: input.kind,
        origin: input.origin,
        subject_ids: input.subjects,
        evidence_sha256: input.evidence.sha256,
      }
      await tx.$executeRaw`
        SELECT audit.record_event('web', 'agent.proposal.created', ${id}, ${JSON.stringify(details)}::jsonb)
      `
      return { id }
    })
  }

  /** Approved rows that never reached markExecuted or markFailed within ten minutes are failed as interrupted. */
  private async failInterrupted(htxCode: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('dxos.actor', 'system:web', true)`
      const rows = await tx.$queryRaw<{ id: string }[]>`
        UPDATE platform.agent_proposals
        SET status = 'failed', executed_at = now(), result = ${JSON.stringify({ error: 'interrupted' })}::jsonb
        WHERE htx_code = ${htxCode}
          AND status = 'approved'
          AND executed_at IS NULL
          AND decided_at < now() - interval '10 minutes'
        RETURNING id::text AS id
      `
      for (const row of rows) {
        await tx.$executeRaw`
          SELECT audit.record_event('web', 'agent.proposal.failed', ${row.id}, ${JSON.stringify({ actor: 'system:web', error: 'interrupted' })}::jsonb)
        `
      }
    })
  }

  async list(htxCode: string, filter: ProposalFilter): Promise<Proposal[]> {
    await this.failInterrupted(htxCode)
    const statuses = filter.statuses && filter.statuses.length > 0 ? filter.statuses : null
    const statusClause = statuses ? Prisma.sql`AND status = ANY(${statuses}::text[])` : Prisma.empty
    const kindClause = filter.kind ? Prisma.sql`AND kind = ${filter.kind}` : Prisma.empty

    // A proposal past its expiry no longer waits for a decision, even before the create path marks it expired.
    const rows = await prisma.$queryRaw<ProposalRow[]>`
      SELECT id::text AS id, htx_code, run_id::text AS run_id, agent, kind, payload, reason_vi,
             evidence, confidence, risk, status, origin, requested_by, dedupe_key,
             created_at, expires_at, decided_by, decided_by_name, decided_at,
             decision_channel, decision_note, edited_payload, executed_at, result
      FROM platform.agent_proposals
      WHERE htx_code = ${htxCode} ${statusClause} ${kindClause}
        AND NOT (status = 'proposed' AND expires_at <= now())
      ORDER BY created_at DESC
      LIMIT ${filter.limit}
    `
    return rows.map(mapProposal)
  }

  async findById(htxCode: string, id: string): Promise<Proposal | null> {
    const rows = await prisma.$queryRaw<ProposalRow[]>`
      SELECT id::text AS id, htx_code, run_id::text AS run_id, agent, kind, payload, reason_vi,
             evidence, confidence, risk, status, origin, requested_by, dedupe_key,
             created_at, expires_at, decided_by, decided_by_name, decided_at,
             decision_channel, decision_note, edited_payload, executed_at, result
      FROM platform.agent_proposals
      WHERE id = ${id}::uuid AND htx_code = ${htxCode}
      LIMIT 1
    `
    return rows[0] ? mapProposal(rows[0]) : null
  }

  async claim(htxCode: string, id: string, decision: ProposalDecisionRecord): Promise<Proposal | null> {
    const actor = `user:${decision.userId}`
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('dxos.actor', ${actor}, true)`
      const editedJson = decision.editedPayload ? JSON.stringify(decision.editedPayload) : null
      const rows = await tx.$queryRaw<ProposalRow[]>`
        UPDATE platform.agent_proposals
        SET status = 'approved',
            decided_by = ${decision.userId},
            decided_by_name = ${decision.userName},
            decided_at = now(),
            decision_channel = ${decision.channel},
            decision_note = ${decision.note},
            edited_payload = ${editedJson}::jsonb
        WHERE id = ${id}::uuid
          AND htx_code = ${htxCode}
          AND status = 'proposed'
          AND expires_at > now()
        RETURNING id::text AS id, htx_code, run_id::text AS run_id, agent, kind, payload, reason_vi,
                  evidence, confidence, risk, status, origin, requested_by, dedupe_key,
                  created_at, expires_at, decided_by, decided_by_name, decided_at,
                  decision_channel, decision_note, edited_payload, executed_at, result
      `
      if (!rows.length) return null
      const row = rows[0]
      const details = {
        actor,
        role: decision.role,
        kind: row.kind,
        agent: row.agent,
        channel: decision.channel,
        evidence_sha256: row.evidence?.sha256 ?? null,
      }
      await tx.$executeRaw`
        SELECT audit.record_event('web', 'agent.proposal.approved', ${id}, ${JSON.stringify(details)}::jsonb)
      `
      return mapProposal(row)
    })
  }

  async markRejected(htxCode: string, id: string, decision: ProposalDecisionRecord): Promise<Proposal | null> {
    const actor = `user:${decision.userId}`
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('dxos.actor', ${actor}, true)`
      const rows = await tx.$queryRaw<ProposalRow[]>`
        UPDATE platform.agent_proposals
        SET status = 'rejected',
            decided_by = ${decision.userId},
            decided_by_name = ${decision.userName},
            decided_at = now(),
            decision_channel = ${decision.channel},
            decision_note = ${decision.note}
        WHERE id = ${id}::uuid
          AND htx_code = ${htxCode}
          AND status = 'proposed'
        RETURNING id::text AS id, htx_code, run_id::text AS run_id, agent, kind, payload, reason_vi,
                  evidence, confidence, risk, status, origin, requested_by, dedupe_key,
                  created_at, expires_at, decided_by, decided_by_name, decided_at,
                  decision_channel, decision_note, edited_payload, executed_at, result
      `
      if (!rows.length) return null
      const row = rows[0]
      const details = {
        actor,
        role: decision.role,
        kind: row.kind,
        agent: row.agent,
        channel: decision.channel,
        note: decision.note ? truncateText(decision.note) : null,
      }
      await tx.$executeRaw`
        SELECT audit.record_event('web', 'agent.proposal.rejected', ${id}, ${JSON.stringify(details)}::jsonb)
      `
      return mapProposal(row)
    })
  }

  async markStale(htxCode: string, id: string, meta?: { actorId?: string }): Promise<void> {
    const actor = meta?.actorId ? `user:${meta.actorId}` : 'system:web'
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('dxos.actor', ${actor}, true)`
      const count = await tx.$executeRaw`
        UPDATE platform.agent_proposals
        SET status = 'stale'
        WHERE id = ${id}::uuid AND htx_code = ${htxCode} AND status = 'proposed'
      `
      if (count > 0) {
        await tx.$executeRaw`
          SELECT audit.record_event('web', 'agent.proposal.stale', ${id}, ${JSON.stringify({ actor })}::jsonb)
        `
      }
    })
  }

  async markExpired(htxCode: string, id: string, meta?: { actorId?: string }): Promise<void> {
    const actor = meta?.actorId ? `user:${meta.actorId}` : 'system:web'
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('dxos.actor', ${actor}, true)`
      const count = await tx.$executeRaw`
        UPDATE platform.agent_proposals
        SET status = 'expired'
        WHERE id = ${id}::uuid AND htx_code = ${htxCode} AND status = 'proposed'
      `
      if (count > 0) {
        await tx.$executeRaw`
          SELECT audit.record_event('web', 'agent.proposal.expired', ${id}, ${JSON.stringify({ actor })}::jsonb)
        `
      }
    })
  }

  async markExecuted(id: string, result: Record<string, unknown>, meta?: { actorId?: string }): Promise<void> {
    const actor = meta?.actorId ? `user:${meta.actorId}` : 'system:web'
    const resultJson = JSON.stringify(result)
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('dxos.actor', ${actor}, true)`
      await tx.$executeRaw`
        UPDATE platform.agent_proposals
        SET status = 'executed', executed_at = now(), result = ${resultJson}::jsonb
        WHERE id = ${id}::uuid AND status = 'approved'
      `
      const details = { actor, result: truncateText(resultJson) }
      await tx.$executeRaw`
        SELECT audit.record_event('web', 'agent.proposal.executed', ${id}, ${JSON.stringify(details)}::jsonb)
      `
    })
  }

  async markFailed(id: string, error: string, meta?: { actorId?: string }): Promise<void> {
    const actor = meta?.actorId ? `user:${meta.actorId}` : 'system:web'
    const truncated = truncateText(error)
    const resultJson = JSON.stringify({ error: truncated })
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('dxos.actor', ${actor}, true)`
      await tx.$executeRaw`
        UPDATE platform.agent_proposals
        SET status = 'failed', executed_at = now(), result = ${resultJson}::jsonb
        WHERE id = ${id}::uuid AND status = 'approved'
      `
      const details = { actor, error: truncated }
      await tx.$executeRaw`
        SELECT audit.record_event('web', 'agent.proposal.failed', ${id}, ${JSON.stringify(details)}::jsonb)
      `
    })
  }
}
