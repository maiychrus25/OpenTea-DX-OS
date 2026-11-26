// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { canonicalJson, evidenceDigest, sha256Hex } from '@/domain/agent/evidence'
import type { AutopilotRepository } from '@/domain/agent/ports/AutopilotRepository'
import type { ProposalRepository } from '@/domain/agent/ports/ProposalRepository'
import type { Evidence, Origin } from '@/domain/agent/proposal'
import { ValidationError } from '@/domain/errors'
import { ensureAppActions, getAction } from './action-catalog'
import { EVIDENCE_LOADERS, type EvidenceLoaders } from './actions/journal-evidence'
import { autoEligibility, shadowEligibility, windowFor } from './autopilot/eligibility'

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
  /** Where a user proposal came from (the MCP route), recorded in the audit event; agents leave it out. */
  channel?: string | null
  now?: Date
}

export class CreateProposalUseCase {
  constructor(
    private readonly repo: Pick<ProposalRepository, 'create' | 'createdSince'>,
    private readonly loaders: EvidenceLoaders = EVIDENCE_LOADERS,
    /** M12: when given, a proposal of an eligible kind gets its blocking window while the mode is on. */
    private readonly autopilot?: Pick<AutopilotRepository, 'get'>
  ) {}

  async execute(input: CreateProposalInput): Promise<{ id: string } | null> {
    await ensureAppActions(input.kind)
    const definition = getAction(input.kind, input.htxCode)
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
    await definition.validate?.(parsedPayload.data, { htxCode: input.htxCode })
    // Text a human adds when deciding (for example a note to households) is never written by an agent.
    if (input.origin === 'agent' && definition.humanOnlyFields.some((key) => key in input.payload)) {
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
      // An app's own evidence row (`app:<id>`) is the app's word: only an action of that same app may cite it.
      const appEvidence = row.table.startsWith('app:') && definition.kind.startsWith(`app.${row.table.slice(4)}.`)
      if (!appEvidence && !Object.prototype.hasOwnProperty.call(this.loaders, row.table)) {
        throw new ValidationError('INVALID_EVIDENCE_TABLE')
      }
      if (row.values !== undefined && sha256Hex(canonicalJson(row.values)) !== row.sha256) {
        throw new ValidationError('INVALID_EVIDENCE')
      }
      // Every row must belong to this cooperative; the agent cannot reference another HTX's records.
      if (!appEvidence && !(await this.loaders[row.table](input.htxCode, row.id))) {
        throw new ValidationError('EVIDENCE_NOT_IN_HTX')
      }
    }

    // With a subjectTable every subject must have its evidence row in that table; null means dedupe key only.
    const subjects = Array.from(new Set(definition.subjects(parsedPayload.data, input.evidence)))
    if (definition.subjectTable !== null) {
      for (const subject of subjects) {
        if (!rows.some((r) => r.table === definition.subjectTable && r.id === subject)) {
          throw new ValidationError('SUBJECT_NOT_IN_EVIDENCE')
        }
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
    if (
      definition.repeatAfterHours !== null &&
      (await this.repo.createdSince(
        input.htxCode,
        dedupeKey,
        new Date(now.getTime() - definition.repeatAfterHours * 3_600_000)
      ))
    ) {
      return null
    }

    const candidate = { origin: input.origin, payload: parsedPayload.data as Record<string, unknown>, evidence: input.evidence }
    const runAt = await this.windowEnd(input.htxCode, candidate, definition, now)

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
      channel: input.channel ?? null,
      dedupeKey,
      subjects,
      expiresAt,
      shadowAuto: shadowEligibility(candidate, definition),
      runAt,
    })
  }

  /** When the tick may run this proposal: only while the mode is on and the proposal is eligible. A failed read means no window. */
  private async windowEnd(
    htxCode: string,
    candidate: Parameters<typeof autoEligibility>[0],
    definition: Parameters<typeof autoEligibility>[1],
    now: Date
  ): Promise<Date | null> {
    if (!this.autopilot) return null
    try {
      const config = await this.autopilot.get(htxCode)
      if (!config.enabled || !autoEligibility(candidate, definition, config).eligible) return null
      return new Date(now.getTime() + windowFor(definition))
    } catch (err) {
      console.error('[CreateProposal] could not read the autonomous mode; the proposal waits for a person', err)
      return null
    }
  }
}
