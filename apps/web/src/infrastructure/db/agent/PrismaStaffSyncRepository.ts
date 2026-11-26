// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type {
  AckOutcome,
  PendingStaffTask,
  RosterEntry,
  StaffSyncRepository,
} from '@/domain/agent/ports/StaffSyncRepository'
import { prisma } from '@/infrastructure/db/prisma.client'

const ACTOR = 'system:staff'
const TASK_LIMIT = 200

/** Persistence for the staff sync routes: raw queries on the platform tables, each scoped by `htx_code`. */
export class PrismaStaffSyncRepository implements StaffSyncRepository {
  async pendingTasks(htxCode: string): Promise<PendingStaffTask[]> {
    const rows = await prisma.$queryRaw<
      { id: string; payload: Record<string, unknown>; decided_by_name: string | null; decided_at: Date | null }[]
    >`
      SELECT id::text AS id, payload || COALESCE(edited_payload, '{}'::jsonb) AS payload, decided_by_name, decided_at
      FROM platform.agent_proposals
      WHERE htx_code = ${htxCode}
        AND kind = 'staff.task.create'
        AND status = 'sent_to_staff_app'
        AND expires_at > now()
      ORDER BY decided_at ASC, id ASC
      LIMIT ${TASK_LIMIT}
    `
    return rows.map((r) => ({ proposalId: r.id, payload: r.payload, approvedByName: r.decided_by_name, approvedAt: r.decided_at }))
  }

  async acknowledge(htxCode: string, proposalId: string, taskId: string): Promise<AckOutcome> {
    const result = JSON.stringify({ state: 'acknowledged', task_id: taskId })
    const done = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('dxos.actor', ${ACTOR}, true)`
      const rows = await tx.$queryRaw<{ id: string; agent: string }[]>`
        UPDATE platform.agent_proposals
        SET status = 'executed', executed_at = now(), external_ref = ${taskId}, result = ${result}::jsonb
        WHERE id = ${proposalId}::uuid
          AND htx_code = ${htxCode}
          AND kind = 'staff.task.create'
          AND status = 'sent_to_staff_app'
          AND expires_at > now()
        RETURNING id::text AS id, agent
      `
      if (!rows.length) return false
      const details = { actor: ACTOR, agent: rows[0].agent, kind: 'staff.task.create', task_id: taskId }
      await tx.$executeRaw`
        SELECT audit.record_event('web', 'agent.proposal.executed', ${proposalId}, ${JSON.stringify(details)}::jsonb)
      `
      return true
    })
    if (done) return 'acknowledged'

    const rows = await prisma.$queryRaw<{ status: string; external_ref: string | null }[]>`
      SELECT status, external_ref
      FROM platform.agent_proposals
      WHERE id = ${proposalId}::uuid AND htx_code = ${htxCode} AND kind = 'staff.task.create'
    `
    if (!rows.length) return 'not_found'
    return rows[0].status === 'executed' && rows[0].external_ref === taskId ? 'already' : 'conflict'
  }

  async replaceRoster(htxCode: string, staff: RosterEntry[]): Promise<void> {
    const rows = JSON.stringify(
      staff.map((s) => ({ staff_ref: s.staffRef, name: s.name, department: s.department, active: s.active }))
    )
    const refs = staff.map((s) => s.staffRef)
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('dxos.actor', ${ACTOR}, true)`
      await tx.$executeRaw`
        INSERT INTO platform.staff_roster (htx_code, staff_ref, name, department, active, updated_at)
        SELECT ${htxCode}, r.staff_ref, r.name, r.department, r.active, now()
        FROM jsonb_to_recordset(${rows}::jsonb) AS r(staff_ref text, name text, department text, active boolean)
        ON CONFLICT (htx_code, staff_ref)
        DO UPDATE SET name = EXCLUDED.name, department = EXCLUDED.department, active = EXCLUDED.active, updated_at = now()
      `
      await tx.$executeRaw`
        UPDATE platform.staff_roster
        SET active = false, updated_at = now()
        WHERE htx_code = ${htxCode} AND active AND staff_ref <> ALL(${refs}::text[])
      `
    })
  }

  async saveAttendance(htxCode: string, day: string, present: number): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('dxos.actor', ${ACTOR}, true)`
      await tx.$executeRaw`
        INSERT INTO platform.staff_attendance (htx_code, day, present, reported_at)
        VALUES (${htxCode}, ${day}::date, ${present}, now())
        ON CONFLICT (htx_code, day) DO UPDATE SET present = EXCLUDED.present, reported_at = now()
      `
    })
  }

  async activeRoster(htxCode: string): Promise<RosterEntry[]> {
    const rows = await prisma.$queryRaw<{ staff_ref: string; name: string; department: string | null }[]>`
      SELECT staff_ref, name, department
      FROM platform.staff_roster
      WHERE htx_code = ${htxCode} AND active
      ORDER BY staff_ref
    `
    return rows.map((r) => ({ staffRef: r.staff_ref, name: r.name, department: r.department, active: true }))
  }

  async attendance(htxCode: string, day: string): Promise<number | null> {
    const rows = await prisma.$queryRaw<{ present: number }[]>`
      SELECT present FROM platform.staff_attendance WHERE htx_code = ${htxCode} AND day = ${day}::date
    `
    return rows[0]?.present ?? null
  }
}
