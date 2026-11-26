// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { DomainError } from '@/domain/errors'
import { PrismaStaffSyncRepository } from '@/infrastructure/db/agent/PrismaStaffSyncRepository'
import type { ActionDefinition } from '../action-catalog'
import { isRealDay } from '../campaign/vn-day'
import { isEvidenceStale } from './journal-evidence'

/** The result `state` that moves the proposal to `sent_to_staff_app` instead of `executed`. */
export const WAITING_FOR_STAFF_APP = 'waiting_for_staff_app'

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

const staffTaskPayloadSchema = z.object({
  title_vi: z.string().min(1).max(120),
  note_vi: z.string().max(500).optional(),
  parcel_id: z.string().min(1).optional(),
  due_date: z.string().regex(DAY_RE).refine(isRealDay, 'real date'),
  assignee_ref: z.string().min(1).max(64),
  source: z.object({ kind: z.string().min(1).max(64), proposal_id: z.string().min(1).optional() }).strict(),
}).strict()

export type StaffTaskCreatePayload = z.infer<typeof staffTaskPayloadSchema>

function viDate(day: string): string {
  const [y, m, d] = day.split('-')
  return `${d}/${m}/${y}`
}

/**
 * A task for the cooperative's staff app (contract C2). Approving it does not finish it: the staff app pulls it and
 * acknowledges it, which is when the proposal becomes `executed`.
 */
export const staffTaskCreateAction: ActionDefinition<StaffTaskCreatePayload> = {
  kind: 'staff.task.create',
  titleVi: 'Giao việc cho nhân sự',
  risk: 'medium',
  approverRoles: ['manager'],
  origins: ['agent'],
  autonomy: 'auto',
  channels: ['web', 'telegram'],
  payloadSchema: staffTaskPayloadSchema,
  editableFields: ['assignee_ref', 'due_date', 'note_vi'],
  humanOnlyFields: ['note_vi'],
  subjectTable: null,
  repeatAfterHours: 24,
  expiresAfterHours: 24,
  preview(payload) {
    const lines = [payload.title_vi, `Hạn: ${viDate(payload.due_date)}`]
    lines.push(`Người nhận: ${payload.assignee_ref}`)
    if (payload.note_vi) lines.push(payload.note_vi)
    return lines
  },
  subjects(payload) {
    return payload.source.proposal_id ? [payload.source.proposal_id] : []
  },
  async isStale(_payload, evidence, ctx) {
    return isEvidenceStale(evidence, ctx.htxCode, ctx.loaders)
  },
  async execute(payload, approver) {
    // The roster may have changed since the agent proposed; the staff app cannot take a task without an active assignee.
    if (!(await new PrismaStaffSyncRepository().isActive(approver.htxCode, payload.assignee_ref))) {
      throw new DomainError('Người nhận việc không còn trong danh sách nhân sự đang làm. Chọn người khác rồi duyệt lại.')
    }
    return { state: WAITING_FOR_STAFF_APP }
  },
}
