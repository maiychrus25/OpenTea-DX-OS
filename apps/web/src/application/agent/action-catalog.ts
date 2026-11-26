// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { z } from 'zod'
import type { DecisionChannel, Evidence, Origin, Risk } from '@/domain/agent/proposal'
import type { Tenant } from '@/lib/api/tenant'
import { journalApproveAction } from './actions/journal-approve.action'
import { journalRejectAction } from './actions/journal-reject.action'
import { bulletinPublishAction } from './actions/bulletin-publish.action'
import { diseaseInspectionAction } from './actions/disease-inspection.action'
import { harvestApproveAction } from './actions/harvest-approve.action'
import { notificationHouseholdsAction } from './actions/notification-households.action'
import { notificationInternalAction } from './actions/notification-internal.action'
import { agentSettingsUpdateAction } from './actions/agent-settings-update.action'
import { improvementAdoptAction } from './actions/improvement-adopt.action'
import { staffTaskCreateAction } from './actions/staff-task-create.action'
import { appSpecApproveAction } from './actions/app-spec-approve.action'
import { miniappInstallAction } from './actions/miniapp-install.action'
import { miniappRemoveAction } from './actions/miniapp-remove.action'
import { appActionCatalog } from './app-actions/default-app-actions'
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
  /** An app action that moves money: unlockable, with a 2 h window in autonomous mode (M9). */
  money?: boolean
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
  subjects(payload: P, evidence?: Evidence): string[]
  /** Refuses a proposal that could never run (M13: a generated app of another cooperative). Throws ValidationError. */
  validate?(payload: P, ctx: { htxCode: string }): Promise<void>
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
  'bulletin.publish': bulletinPublishAction,
  'agent.settings.update': agentSettingsUpdateAction,
  'improvement.adopt': improvementAdoptAction,
  'staff.task.create': staffTaskCreateAction,
  'app.spec.approve': appSpecApproveAction,
  'miniapp.install': miniappInstallAction,
  'miniapp.remove': miniappRemoveAction,
})

/**
 * A built-in kind, or an `app.<id>.<action>` kind of an installed app from the cache `ensureAppActions` fills.
 * With `htxCode`, an app action resolves only when the app is enabled for that cooperative.
 */
export function getAction(kind: string, htxCode?: string): ActionDefinition<any> | undefined {
  if (Object.prototype.hasOwnProperty.call(ACTION_CATALOG, kind)) return ACTION_CATALOG[kind]
  return appActionCatalog.find(kind, htxCode)
}

/** Refreshes the app actions when older than 60 s; callers that hold only built-in kinds skip it. */
export async function ensureAppActions(kinds?: string | readonly string[]): Promise<void> {
  const list = kinds === undefined ? undefined : typeof kinds === 'string' ? [kinds] : kinds
  if (list === undefined || list.some((kind) => kind.startsWith('app.'))) await appActionCatalog.ensure()
}
