// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { z } from 'zod'
import type { DecisionChannel, Evidence, Origin, Risk } from '@/domain/agent/proposal'
import type { Tenant } from '@/lib/api/tenant'
import { journalApproveAction } from './actions/journal-approve.action'
import { journalRejectAction } from './actions/journal-reject.action'
import { diseaseInspectionAction } from './actions/disease-inspection.action'
import { harvestApproveAction } from './actions/harvest-approve.action'
import { notificationHouseholdsAction } from './actions/notification-households.action'
import { notificationInternalAction } from './actions/notification-internal.action'
import type { EvidenceLoaders } from './actions/journal-evidence'
import type { JournalSubject } from './actions/journal-labels'

export type ApproverRole = 'manager' | 'officer'
export type AutonomyMode = 'auto' | 'unlockable' | 'never'

export interface ActionStalenessContext {
  htxCode: string
  loaders?: EvidenceLoaders
}

export interface ActionDefinition<P extends Record<string, unknown> = Record<string, unknown>> {
  kind: string
  titleVi: string
  risk: Risk
  approverRoles: readonly ApproverRole[]
  origins: readonly Origin[]
  autonomy: AutonomyMode
  channels: readonly DecisionChannel[]
  payloadSchema: z.ZodType<P, z.ZodTypeDef, unknown>
  editableFields: readonly (keyof P & string)[]
  /** Agent-supplied payloads may not carry these keys; a human adds them when deciding. Must be editable. */
  humanOnlyFields: readonly string[]
  /** Table every subject must be a row of; null when subjects are only the dedupe key. */
  subjectTable: string | null
  /** Repeat window: a proposal with the same dedupe key created this recently is not proposed again. */
  repeatAfterHours: number | null
  expiresAfterHours: number
  preview(payload: P, subjects?: ReadonlyMap<string, JournalSubject>, evidence?: Evidence): string[]
  subjects(payload: P): string[]
  isStale(payload: P, evidence: Evidence, ctx: ActionStalenessContext): Promise<boolean>
  execute(payload: P, approver: Tenant): Promise<Record<string, unknown>>
}

export const ACTION_CATALOG: Readonly<Record<string, ActionDefinition<any>>> = Object.freeze({
  'journal.approve': journalApproveAction,
  'journal.reject': journalRejectAction,
  'notification.internal': notificationInternalAction,
  'notification.households': notificationHouseholdsAction,
  'disease.inspection': diseaseInspectionAction,
  'harvest.approve': harvestApproveAction,
})

export function getAction(kind: string): ActionDefinition<any> | undefined {
  return Object.prototype.hasOwnProperty.call(ACTION_CATALOG, kind) ? ACTION_CATALOG[kind] : undefined
}
