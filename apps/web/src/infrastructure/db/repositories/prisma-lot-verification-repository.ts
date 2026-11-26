// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { HarvestDecision, LotVerificationRepository } from '@/domain/repositories/lot-verification-repository'
import { prisma } from '@/infrastructure/db/prisma.client'

interface DecisionRow {
  proposal_id: string
  proposal_sha256: string | null
  event_id: string
  event_sha256: string | null
  role: string | null
  decided_at: Date
}

/** Reads the lot's AI decisions from the proposal and audit tables; nothing here is stored on the lot. */
export class PrismaLotVerificationRepository implements LotVerificationRepository {
  async findHarvestDecisions(lotCode: string): Promise<HarvestDecision[]> {
    const rows = await prisma.$queryRaw<DecisionRow[]>`
      SELECT DISTINCT ON (lp.parcel_id)
             p.id::text AS proposal_id,
             p.evidence->>'sha256' AS proposal_sha256,
             ev.id::text AS event_id,
             ev.new_data->>'evidence_sha256' AS event_sha256,
             ev.new_data->>'role' AS role,
             ev.occurred_at AS decided_at
      FROM lots l
      JOIN lot_parcels lp ON lp.lot_id = l.id
      JOIN platform.agent_proposals p
        ON p.kind = 'harvest.approve'
       AND p.status = 'executed'
       AND p.subject_ids @> ARRAY[lp.parcel_id]::text[]
       AND p.executed_at < l.created_at
      JOIN LATERAL (
        SELECT e.id, e.occurred_at, e.new_data
        FROM audit.events e
        WHERE e.op = 'agent.proposal.approved' AND e.row_id = p.id::text
        ORDER BY e.id DESC
        LIMIT 1
      ) ev ON true
      WHERE l.lot_code = ${lotCode}
      ORDER BY lp.parcel_id, p.executed_at DESC
    `
    return rows.map((r) => ({
      proposalId: r.proposal_id,
      proposalEvidenceSha256: r.proposal_sha256,
      eventId: r.event_id,
      eventEvidenceSha256: r.event_sha256,
      role: r.role,
      decidedAt: r.decided_at,
    }))
  }

  async auditChainIntactThrough(eventId: string): Promise<boolean> {
    const rows = await prisma.$queryRaw<{ intact: boolean }[]>`
      SELECT (first_bad_id IS NULL OR first_bad_id > ${eventId}::bigint) AS intact
      FROM audit.verify_chain()
    `
    return rows[0]?.intact === true
  }
}
