// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { ProposalRepository } from '@/domain/agent/ports/ProposalRepository'
import type { StaffSyncRepository } from '@/domain/agent/ports/StaffSyncRepository'
import type { Proposal } from '@/domain/agent/proposal'
import { refsOf } from '../campaign/CampaignCandidatesUseCase'
import { vnDayOf } from '../campaign/vn-day'

const LIMIT = 500
const WINDOW_MS = 24 * 3_600_000
const SOURCE_KINDS = new Set(['harvest.approve', 'disease.inspection', 'notification.households'])
const SOURCE_TEMPLATES = new Set(['dry_soil', 'rain_after_spray'])

export interface StaffSource {
  id: string
  kind: string
  /** The message template of a `notification.households` source, else null. */
  template: string | null
  parcels: { id: string; code: string }[]
}

export interface StaffInputs {
  /** Executed proposals of the last 24 hours that A8 turns into tasks. */
  proposals: StaffSource[]
  roster: { staff_ref: string; name: string; department: string | null; active: boolean }[]
  /** The present count reported for today, or null when the staff app reported none. */
  attendance: { day: string; present: number } | null
}

/** What A8 reads before it proposes staff tasks (contract C4), scoped to one cooperative. */
export class StaffInputsUseCase {
  constructor(
    private readonly proposals: Pick<ProposalRepository, 'list'>,
    private readonly staff: Pick<StaffSyncRepository, 'activeRoster' | 'attendance'>,
    /** The parcels of this cooperative that match any of the ids or codes. */
    private readonly parcelsOf: (htxCode: string, ids: string[], codes: string[]) => Promise<{ id: string; code: string }[]>
  ) {}

  async execute(htxCode: string, now: Date = new Date()): Promise<StaffInputs> {
    const day = vnDayOf(now)
    const since = now.getTime() - WINDOW_MS
    const executed = await this.proposals.list(htxCode, { statuses: ['executed'], limit: LIMIT })
    const sources = executed.filter((p) => isSource(p) && (p.executedAt ?? p.decidedAt ?? p.createdAt).getTime() >= since)

    const refs = sources.map((proposal) => ({ proposal, ...refsOf(proposal) }))
    const ids = refs.flatMap((r) => r.parcelIds).filter(Boolean)
    const codes = refs.flatMap((r) => r.codes)
    const parcels = ids.length || codes.length ? await this.parcelsOf(htxCode, ids, codes) : []

    const present = await this.staff.attendance(htxCode, day)
    return {
      proposals: refs.map(({ proposal, parcelIds, codes: own }) => ({
        id: proposal.id,
        kind: proposal.kind,
        template: proposal.kind === 'notification.households' ? String(proposal.payload.template ?? '') : null,
        parcels: parcels.filter((p) => parcelIds.includes(p.id) || own.includes(p.code)),
      })),
      roster: (await this.staff.activeRoster(htxCode)).map((s) => ({ staff_ref: s.staffRef, name: s.name, department: s.department, active: true })),
      attendance: present === null ? null : { day, present },
    }
  }
}

function isSource(proposal: Proposal): boolean {
  if (!SOURCE_KINDS.has(proposal.kind)) return false
  return proposal.kind !== 'notification.households' || SOURCE_TEMPLATES.has(String(proposal.payload.template))
}
