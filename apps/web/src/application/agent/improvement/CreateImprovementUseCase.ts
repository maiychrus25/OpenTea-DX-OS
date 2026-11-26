// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { CreateProposalUseCase } from '@/application/agent/CreateProposalUseCase'
import { EVIDENCE_LOADERS, type EvidenceLoaders } from '@/application/agent/actions/journal-evidence'
import { canonicalJson, evidenceDigest, sha256Hex } from '@/domain/agent/evidence'
import type { EvidenceRow, Evidence } from '@/domain/agent/proposal'
import type { ImprovementRepository, ImprovementKind } from '@/domain/agent/ports/ImprovementRepository'
import type { ProposalRepository } from '@/domain/agent/ports/ProposalRepository'
import { ValidationError } from '@/domain/errors'

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const SETTING_AGENTS = ['field-watch', 'disease-watch', 'harvest-ready', 'digest'] as const

const settingsChangeSchema = z.object({
  agent: z.enum(SETTING_AGENTS),
  thresholds: z.record(z.number().int()).optional(),
  schedule: z.string().nullable().optional(),
})

const templateSchema = z.object({
  weekday: z.number().int().min(1).max(7),
  goal_key: z.string().trim().min(1).max(64),
  title_vi: z.string().trim().min(1).max(120),
})

/** A Monday in ISO calendar terms: the week of a proposal is the Monday (Vietnam) it was made. */
function isMonday(day: string): boolean {
  return new Date(`${day}T00:00:00Z`).getUTCDay() === 1
}

/** A week is the Monday (ISO date) a proposal was made. */
export const weekSchema = z.string().regex(DAY_RE).refine(isMonday, { message: 'Tuần phải bắt đầu vào thứ Hai' })

/** Body of `POST /api/internal/agent/improvements` (contract C5). Settings and template fields follow the kind. */
export const createImprovementSchema = z.object({
  week: weekSchema,
  kind: z.enum(['setting', 'process', 'template']),
  metric_key: z.string().trim().min(1).max(200),
  title_vi: z.string().trim().min(1).max(120),
  rationale_vi: z.string().trim().min(1).max(600),
  baseline: z.number().finite(),
  evidence: z.record(z.unknown()),
  settings_change: settingsChangeSchema.nullable().optional(),
  template: templateSchema.nullable().optional(),
  run_id: z.string().uuid().nullable().optional(),
})

export type CreateImprovementInput = z.infer<typeof createImprovementSchema>

export type CreateImprovementResult = { deduped: true } | { deduped: false; id: string; proposalId: string }

export interface CreateImprovementDeps {
  improvements: Pick<ImprovementRepository, 'insertIfNew' | 'remove' | 'linkProposal'>
  proposals: Pick<ProposalRepository, 'create' | 'createdSince'>
  runOwned(htxCode: string, runId: string): Promise<boolean>
  loaders?: EvidenceLoaders
}

function shapeOf(body: CreateImprovementInput): void {
  const ok =
    (body.kind === 'setting' && body.settings_change != null && body.template == null) ||
    (body.kind === 'template' && body.template != null && body.settings_change == null) ||
    (body.kind === 'process' && body.settings_change == null && body.template == null)
  if (!ok) throw new ValidationError('INVALID_IMPROVEMENT')
}

function evidenceRow(table: string, id: string, values: Record<string, unknown>): EvidenceRow {
  return { table, id, sha256: sha256Hex(canonicalJson(values)), values }
}

/**
 * Stores A10's improvement and proposes it, as an ordinary proposal linked to the row (contract C5).
 * The row and its proposal are not one database transaction (the proposal use case uses its own client),
 * so a proposal that cannot be made removes the row again.
 */
export class CreateImprovementUseCase {
  constructor(private readonly deps: CreateImprovementDeps) {}

  async execute(htxCode: string, body: CreateImprovementInput): Promise<CreateImprovementResult> {
    shapeOf(body)
    if (body.run_id && !(await this.deps.runOwned(htxCode, body.run_id))) {
      throw new ValidationError('INVALID_RUN_ID')
    }

    const stored = await this.deps.improvements.insertIfNew({
      htxCode,
      week: body.week,
      kind: body.kind as ImprovementKind,
      metricKey: body.metric_key,
      titleVi: body.title_vi,
      rationaleVi: body.rationale_vi,
      baseline: body.baseline,
      evidence: body.evidence,
      template: body.template ?? null,
    })
    if (!stored) return { deduped: true }

    try {
      const created = await new CreateProposalUseCase(this.deps.proposals as ProposalRepository, this.deps.loaders ?? EVIDENCE_LOADERS).execute({
        htxCode,
        runId: body.run_id ?? null,
        agent: 'improvement',
        kind: body.kind === 'setting' ? 'agent.settings.update' : 'improvement.adopt',
        payload: this.payloadOf(body, stored.id),
        reasonVi: body.rationale_vi,
        evidence: await this.evidenceOf(htxCode, body, stored.id),
        origin: 'agent',
      })
      if (!created) {
        await this.deps.improvements.remove(htxCode, stored.id)
        return { deduped: true }
      }
      await this.deps.improvements.linkProposal(htxCode, stored.id, created.id)
      return { deduped: false, id: stored.id, proposalId: created.id }
    } catch (err) {
      await this.deps.improvements.remove(htxCode, stored.id)
      throw err
    }
  }

  private payloadOf(body: CreateImprovementInput, improvementId: string): Record<string, unknown> {
    if (body.kind !== 'setting') return { improvement_id: improvementId }
    const change = body.settings_change!
    return {
      agent: change.agent,
      ...(change.thresholds ? { thresholds: change.thresholds } : {}),
      ...(typeof change.schedule === 'string' ? { schedule: change.schedule } : {}),
    }
  }

  /** The evidence the proposal is checked against: the agent's settings row, or the improvement row itself. */
  private async evidenceOf(htxCode: string, body: CreateImprovementInput, improvementId: string): Promise<Evidence> {
    const loaders = this.deps.loaders ?? EVIDENCE_LOADERS
    let row: EvidenceRow
    if (body.kind === 'setting') {
      const id = `${htxCode}:${body.settings_change!.agent}`
      const values = await loaders.agent_settings(htxCode, id)
      if (!values) throw new ValidationError('INVALID_EVIDENCE')
      row = evidenceRow('agent_settings', id, values)
    } else {
      const values = await loaders.improvements(htxCode, improvementId)
      if (!values) throw new ValidationError('INVALID_EVIDENCE')
      row = evidenceRow('improvements', improvementId, values)
    }
    return { rows: [row], sha256: evidenceDigest([row]) }
  }
}
