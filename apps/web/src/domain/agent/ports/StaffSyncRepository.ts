// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export interface PendingStaffTask {
  proposalId: string
  /** The payload as the manager left it: the agent's payload with the edited fields on top. */
  payload: Record<string, unknown>
  approvedByName: string | null
  approvedAt: Date | null
}

export interface RosterEntry {
  staffRef: string
  name: string
  department: string | null
  active: boolean
}

export type AckOutcome = 'acknowledged' | 'already' | 'not_found' | 'conflict'

/** The staff app's side of the core: tasks it pulls, and the roster and attendance it reports. Always one cooperative. */
export interface StaffSyncRepository {
  /** Staff tasks sent to the staff app that have not expired. */
  pendingTasks(htxCode: string): Promise<PendingStaffTask[]>
  /** Moves a sent task to executed with the staff app's task id. Repeating it with the same id answers `already`. */
  acknowledge(htxCode: string, proposalId: string, taskId: string): Promise<AckOutcome>
  /** Upserts the given staff and marks every other row of the cooperative inactive. */
  replaceRoster(htxCode: string, staff: RosterEntry[]): Promise<void>
  saveAttendance(htxCode: string, day: string, present: number): Promise<void>
  isActive(htxCode: string, staffRef: string): Promise<boolean>
  activeRoster(htxCode: string): Promise<RosterEntry[]>
  /** The present count reported for a Vietnam day, or null when nothing was reported. */
  attendance(htxCode: string, day: string): Promise<number | null>
}
