// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { canonicalJson, evidenceDigest } from '@/domain/agent/evidence'
import type { ProposalRepository } from '@/domain/agent/ports/ProposalRepository'
import type { Evidence, Origin } from '@/domain/agent/proposal'
import { ValidationError } from '@/domain/errors'
import { getAction } from './action-catalog'

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
  dedupeKey?: string
  now?: Date
}

export class CreateProposalUseCase {
  constructor(private readonly repo: Pick<ProposalRepository, 'create'>) {}

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

    if (!input.evidence || input.evidence.sha256 !== evidenceDigest(input.evidence.rows ?? [])) {
      throw new ValidationError('INVALID_EVIDENCE')
    }

    const reasonVi = input.reasonVi.trim()
    if (!reasonVi || reasonVi.length > 1000) {
      throw new ValidationError('INVALID_REASON')
    }

    const now = input.now ?? new Date()
    const expiresAt = new Date(now.getTime() + definition.expiresAfterHours * 3_600_000)
    const dedupeKey = input.dedupeKey?.trim() || `${definition.kind}:${canonicalJson(parsedPayload.data)}`

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
      expiresAt,
    })
  }
}
