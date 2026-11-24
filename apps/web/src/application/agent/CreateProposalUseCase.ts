// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { canonicalJson, evidenceDigest, sha256Hex } from '@/domain/agent/evidence'
import type { ProposalRepository } from '@/domain/agent/ports/ProposalRepository'
import type { Evidence, Origin } from '@/domain/agent/proposal'
import { ValidationError } from '@/domain/errors'
import { getAction } from './action-catalog'
import { EVIDENCE_LOADERS, type EvidenceLoaders } from './actions/journal-evidence'

export const MAX_EVIDENCE_ROWS = 50

export interface CreateProposalInput {
  htxCode: string
  runId?: string | null
  agent: string
  kind: string
  payload: Record<string, unknown>
  reasonVi: string
  evidence: Evidence
  confidence?: number | null
  origin: Origin
  requestedBy?: string | null
  now?: Date
}

export class CreateProposalUseCase {
  constructor(
    private readonly repo: Pick<ProposalRepository, 'create'>,
    private readonly loaders: EvidenceLoaders = EVIDENCE_LOADERS
  ) {}

  async execute(input: CreateProposalInput): Promise<{ id: string } | null> {
    const definition = getAction(input.kind)
    if (!definition) {
      throw new ValidationError('UNKNOWN_KIND')
    }
    if (!definition.origins.includes(input.origin)) {
      throw new ValidationError('INVALID_ORIGIN')
    }

    const parsedPayload = definition.payloadSchema.safeParse(input.payload)
    if (!parsedPayload.success) {
      throw new ValidationError('INVALID_PAYLOAD')
    }

    const rows = input.evidence?.rows ?? []
    if (!input.evidence || input.evidence.sha256 !== evidenceDigest(rows)) {
      throw new ValidationError('INVALID_EVIDENCE')
    }
    if (rows.length > MAX_EVIDENCE_ROWS) {
      throw new ValidationError('TOO_MANY_EVIDENCE_ROWS')
    }
    for (const row of rows) {
      if (!Object.prototype.hasOwnProperty.call(this.loaders, row.table)) {
        throw new ValidationError('INVALID_EVIDENCE_TABLE')
      }
      if (row.values !== undefined && sha256Hex(canonicalJson(row.values)) !== row.sha256) {
        throw new ValidationError('INVALID_EVIDENCE')
      }
      // Every row must belong to this cooperative; the agent cannot reference another HTX's records.
      if (!(await this.loaders[row.table](input.htxCode, row.id))) {
        throw new ValidationError('EVIDENCE_NOT_IN_HTX')
      }
    }

    // Subjects are journal entries for every kind in the catalogue, so each must have its evidence row.
    const subjects = Array.from(new Set(definition.subjects(parsedPayload.data)))
    for (const subject of subjects) {
      if (!rows.some((r) => r.table === 'journal_entries' && r.id === subject)) {
        throw new ValidationError('SUBJECT_NOT_IN_EVIDENCE')
      }
    }

    const reasonVi = input.reasonVi.trim()
    if (!reasonVi || reasonVi.length > 1000) {
      throw new ValidationError('INVALID_REASON')
    }

    const now = input.now ?? new Date()
    const expiresAt = new Date(now.getTime() + definition.expiresAfterHours * 3_600_000)
    // The agent's own dedupe key is ignored: duplicates are judged by the subjects they act on.
    const dedupeKey = `${definition.kind}:${canonicalJson(subjects)}`

    return this.repo.create({
      htxCode: input.htxCode,
      runId: input.runId ?? null,
      agent: input.agent,
      kind: definition.kind,
      payload: parsedPayload.data,
      reasonVi,
      evidence: input.evidence,
      confidence: input.confidence ?? null,
      risk: definition.risk,
      origin: input.origin,
      requestedBy: input.requestedBy ?? null,
      dedupeKey,
      subjects,
      expiresAt,
    })
  }
}
