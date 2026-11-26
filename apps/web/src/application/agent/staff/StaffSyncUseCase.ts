// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import type { AckOutcome, StaffSyncRepository } from '@/domain/agent/ports/StaffSyncRepository'
import { ValidationError } from '@/domain/errors'
import { isRealDay, vnDayOf } from '../campaign/vn-day'

export const MAX_ROSTER = 500

export const rosterBodySchema = z.object({
  staff: z
    .array(
      z.object({
        staff_ref: z.string().trim().min(1).max(100),
        name: z.string().trim().min(1).max(200),
        department: z.string().trim().max(100).nullish(),
        active: z.boolean(),
      }).strict()
    )
    .max(MAX_ROSTER)
    .refine((staff) => new Set(staff.map((s) => s.staff_ref)).size === staff.length, 'staff_ref must be unique'),
}).strict()

export const attendanceBodySchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealDay, 'real date'),
  present: z.number().int().min(0).max(100_000),
}).strict()

export const ackBodySchema = z.object({ task_id: z.string().trim().min(1).max(100) }).strict()

export interface StaffTaskView {
  proposal_id: string
  title_vi: string
  note_vi: string | null
  parcel_code: string | null
  due_date: string
  assignee_ref: string | null
  approved_by_name: string | null
  approved_at: string | null
}

const text = (value: unknown): string | null => (typeof value === 'string' && value ? value : null)

/** What the staff app does against the core (contract C3). The cooperative always comes from the staff token. */
export class StaffSyncUseCase {
  constructor(
    private readonly repo: StaffSyncRepository,
    private readonly parcelCodesByIds: (htxCode: string, parcelIds: string[]) => Promise<Map<string, string>>,
    private readonly now: () => Date = () => new Date()
  ) {}

  async tasks(htxCode: string): Promise<StaffTaskView[]> {
    const pending = await this.repo.pendingTasks(htxCode)
    const parcelIds = pending.map((t) => text(t.payload.parcel_id)).filter((id): id is string => id !== null)
    const codes = parcelIds.length ? await this.parcelCodesByIds(htxCode, parcelIds) : new Map<string, string>()
    return pending.map((t) => {
      const parcelId = text(t.payload.parcel_id)
      return {
        proposal_id: t.proposalId,
        title_vi: String(t.payload.title_vi ?? ''),
        note_vi: text(t.payload.note_vi),
        parcel_code: parcelId ? (codes.get(parcelId) ?? null) : null,
        due_date: String(t.payload.due_date ?? ''),
        assignee_ref: text(t.payload.assignee_ref),
        approved_by_name: t.approvedByName,
        approved_at: t.approvedAt ? t.approvedAt.toISOString() : null,
      }
    })
  }

  acknowledge(htxCode: string, proposalId: string, taskId: string): Promise<AckOutcome> {
    return this.repo.acknowledge(htxCode, proposalId, taskId)
  }

  replaceRoster(htxCode: string, body: z.infer<typeof rosterBodySchema>): Promise<void> {
    return this.repo.replaceRoster(
      htxCode,
      body.staff.map((s) => ({ staffRef: s.staff_ref, name: s.name, department: s.department || null, active: s.active }))
    )
  }

  async saveAttendance(htxCode: string, body: z.infer<typeof attendanceBodySchema>): Promise<void> {
    // Only today's count is ever read, so a report for another day is a client mistake.
    if (body.day !== vnDayOf(this.now())) throw new ValidationError('ATTENDANCE_DAY_NOT_TODAY')
    await this.repo.saveAttendance(htxCode, body.day, body.present)
  }
}
