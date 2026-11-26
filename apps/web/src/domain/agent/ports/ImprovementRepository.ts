// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export type ImprovementKind = 'setting' | 'process' | 'template'
export type ImprovementStatus = 'proposed' | 'adopted' | 'declined' | 'measured'
export type EffectVerdict = 'helped' | 'no_effect' | 'drop'
export type EffectAfter = '2w' | '4w'

export interface ImprovementTemplate {
  weekday: number
  goal_key: string
  title_vi: string
}

export interface ImprovementEffectEntry {
  value: number
  verdict: EffectVerdict
  /** ISO instant the measurement was recorded; the weekly report reads measurements by this time. */
  at: string
}

export interface ImprovementEffect {
  after_2w?: ImprovementEffectEntry
  after_4w?: ImprovementEffectEntry
}

export interface Improvement {
  id: string
  htxCode: string
  week: string
  kind: ImprovementKind
  metricKey: string
  titleVi: string
  rationaleVi: string
  baseline: number
  evidence: Record<string, unknown>
  proposalId: string | null
  status: ImprovementStatus
  decidedBy: string | null
  adoptedAt: Date | null
  effect: ImprovementEffect
  template: ImprovementTemplate | null
  createdAt: Date
}

export interface NewImprovement {
  htxCode: string
  week: string
  kind: ImprovementKind
  metricKey: string
  titleVi: string
  rationaleVi: string
  baseline: number
  evidence: Record<string, unknown>
  template: ImprovementTemplate | null
}

export type ImprovementSettlement =
  | { status: 'adopted'; decidedBy: string; adoptedAt: Date }
  | { status: 'declined'; decidedBy: string }

export type EffectResult = 'ok' | 'not_found' | 'conflict'

export interface ImprovementRepository {
  /** Inserts unless the cooperative already has this metric for the week; null when it has. */
  insertIfNew(input: NewImprovement): Promise<{ id: string } | null>
  /** Deletes an improvement whose proposal could not be created. */
  remove(htxCode: string, id: string): Promise<void>
  linkProposal(htxCode: string, id: string, proposalId: string): Promise<void>
  findById(htxCode: string, id: string): Promise<Improvement | null>
  /** Improvements proposed on or after the ISO date `since` (a Monday). */
  listSince(htxCode: string, since: string): Promise<Improvement[]>
  /** Moves a still-proposed improvement to its status when its proposal is decided. */
  settleProposal(htxCode: string, proposalId: string, settlement: ImprovementSettlement): Promise<void>
  /** Sets `effect.after_<after>` on an adopted improvement; `4w` also marks it measured. */
  recordEffect(
    htxCode: string,
    id: string,
    after: EffectAfter,
    entry: { value: number; verdict: EffectVerdict; at: Date }
  ): Promise<EffectResult>
  /** Adopted template improvements for a Vietnam weekday (Monday = 1) that no measurement has marked as a drop. */
  activeTemplates(htxCode: string, weekday: number): Promise<Improvement[]>
  /** Improvements with a measurement recorded in [from, to]. */
  measuredBetween(htxCode: string, from: Date, to: Date): Promise<Improvement[]>
  /** Improvements proposed for one Monday (ISO date). */
  countForWeek(htxCode: string, week: string): Promise<number>
}
