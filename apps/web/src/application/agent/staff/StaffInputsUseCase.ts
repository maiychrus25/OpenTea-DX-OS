// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { ProposalRepository } from '@/domain/agent/ports/ProposalRepository'
import type { StaffSyncRepository } from '@/domain/agent/ports/StaffSyncRepository'
import type { Proposal } from '@/domain/agent/proposal'
import { refsOf } from '../campaign/CampaignCandidatesUseCase'
import { vnDayOf, vnDayStart } from '../campaign/vn-day'

const LIMIT = 500
const WINDOW_MS = 24 * 3_600_000
const SOURCE_KINDS = new Set(['harvest.approve', 'disease.inspection', 'notification.households'])
const SOURCE_TEMPLATES = new Set(['dry_soil', 'rain_after_spray'])

export interface StaffSource {
  proposal_id: string
  kind: string
  /** The message template of a `notification.households` source, else null. */
  template: string | null
  parcel_codes: string[]
  decided_at: string | null
}

export interface StaffInputs {
  day: string
  /** Executed proposals of the last 24 hours that A8 turns into tasks. */
  sources: StaffSource[]
  roster: { staff_ref: string; name: string; department: string | null }[]
  /** Present count reported for the day, or null when the staff app reported none. */
  attendance_present: number | null
  /** Staff tasks already proposed for the day per `assignee_ref`, in any status but rejected, expired or stale. */
  assigned_today: Record<string, number>
}

/** What A8 reads before it proposes staff tasks (contract C4), scoped to one cooperative. */
export class StaffInputsUseCase {
  constructor(
    private readonly proposals: Pick<ProposalRepository, 'list'>,
    private readonly staff: Pick<StaffSyncRepository, 'activeRoster' | 'attendance'>,
    private readonly parcelCodesByIds: (htxCode: string, parcelIds: string[]) => Promise<Map<string, string>>
  ) {}

  async execute(htxCode: string, now: Date = new Date()): Promise<StaffInputs> {
    const day = vnDayOf(now)
    const since = now.getTime() - WINDOW_MS
    const executed = await this.proposals.list(htxCode, { statuses: ['executed'], limit: LIMIT })
    const sources = executed.filter((p) => isSource(p) && (p.executedAt ?? p.decidedAt ?? p.createdAt).getTime() >= since)

    const refs = sources.map((proposal) => ({ proposal, ...refsOf(proposal) }))
    const ids = refs.flatMap((r) => r.parcelIds).filter(Boolean)
    const codes = ids.length ? await this.parcelCodesByIds(htxCode, ids) : new Map<string, string>()

    const tasks = await this.proposals.list(htxCode, { statuses: ['proposed', 'approved', 'sent_to_staff_app', 'executed'], kind: 'staff.task.create', limit: LIMIT })
    const assigned: Record<string, number> = {}
    for (const task of tasks) {
      const ref = (task.editedPayload?.assignee_ref ?? task.payload.assignee_ref) as unknown
      if (task.createdAt >= vnDayStart(day) && typeof ref === 'string') assigned[ref] = (assigned[ref] ?? 0) + 1
    }

    return {
      day,
      sources: refs.map(({ proposal, parcelIds, codes: own }) => ({
        proposal_id: proposal.id,
        kind: proposal.kind,
        template: proposal.kind === 'notification.households' ? String(proposal.payload.template ?? '') : null,
        parcel_codes: Array.from(new Set([...parcelIds.map((id) => codes.get(id)).filter((c): c is string => Boolean(c)), ...own])),
        decided_at: proposal.decidedAt ? proposal.decidedAt.toISOString() : null,
      })),
      roster: (await this.staff.activeRoster(htxCode)).map((s) => ({ staff_ref: s.staffRef, name: s.name, department: s.department })),
      attendance_present: await this.staff.attendance(htxCode, day),
      assigned_today: assigned,
    }
  }
}

function isSource(proposal: Proposal): boolean {
  if (!SOURCE_KINDS.has(proposal.kind)) return false
  return proposal.kind !== 'notification.households' || SOURCE_TEMPLATES.has(String(proposal.payload.template))
}
