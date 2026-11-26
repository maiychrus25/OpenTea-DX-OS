// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { activeWithdrawals } from '@/domain/journal/active-withdrawals'
import type { ProposalRepository } from '@/domain/agent/ports/ProposalRepository'
import type { Proposal } from '@/domain/agent/proposal'
import { getAction } from '../action-catalog'
import { campaignGoal } from './campaign-goals'
import { vnDayStart } from './vn-day'

/** The rain-forecast threshold of C3: a cache row with at least this much rain marks its parcel. */
const RAIN_MM = 5
const CANDIDATE_LIMIT = 500

/** Reads the facts the campaign rules need, always scoped to one cooperative. */
export interface CandidateSource {
  rainParcelCodes(htxCode: string, now: Date): Promise<string[]>
  /** Non-draft spraying activities whose safe harvest date is after `since`. */
  withdrawalRows(htxCode: string, since: Date): Promise<{ parcel_code: string; safe_harvest_date: Date }[]>
  parcelCodesByIds(htxCode: string, parcelIds: string[]): Promise<Map<string, string>>
  parcelCodesOfEntries(htxCode: string, entryIds: string[]): Promise<Map<string, string>>
}

export interface CampaignCandidate {
  id: string
  kind: string
  risk: string
  title_vi: string
  created_at: string
  parcel_codes: string[]
  goal_key: string
  target: number
  involves_spraying: boolean
  people_needed: number
}

export interface CampaignCandidates {
  day: string
  proposals: CampaignCandidate[]
  rain_parcel_codes: string[]
  withdrawal_parcel_codes: string[]
  people_available: number | null
}

/** Refs a proposal names: parcel ids (harvest), journal entry ids, or parcel codes already in its payload. */
function refsOf(proposal: Proposal): { parcelIds: string[]; entryIds: string[]; codes: string[] } {
  const { payload } = proposal
  switch (proposal.kind) {
    case 'harvest.approve':
      return { parcelIds: [String(payload.parcel_id ?? '')], entryIds: [], codes: [] }
    case 'journal.approve':
      return { parcelIds: [], entryIds: Array.isArray(payload.entry_ids) ? payload.entry_ids.map(String) : [], codes: [] }
    case 'journal.reject':
      return { parcelIds: [], entryIds: [String(payload.entry_id ?? '')], codes: [] }
    case 'disease.inspection':
      return { parcelIds: [], entryIds: [], codes: Array.isArray(payload.parcel_codes) ? payload.parcel_codes.map(String) : [] }
    case 'notification.households': {
      const slots = (payload.slots ?? {}) as { parcel_codes?: unknown }
      return { parcelIds: [], entryIds: [], codes: Array.isArray(slots.parcel_codes) ? slots.parcel_codes.map(String) : [] }
    }
    default:
      return { parcelIds: [], entryIds: [], codes: [] }
  }
}

/** Serves A9 the open proposals and the facts its rules check, for one Vietnam day (contract C3). */
export class CampaignCandidatesUseCase {
  constructor(
    private readonly proposals: Pick<ProposalRepository, 'list'>,
    private readonly source: CandidateSource
  ) {}

  async execute(htxCode: string, day: string, now: Date = new Date()): Promise<CampaignCandidates> {
    const open = await this.proposals.list(htxCode, { statuses: ['proposed'], limit: CANDIDATE_LIMIT })
    const refs = open.map((proposal) => ({ proposal, ...refsOf(proposal) }))

    const parcelIds = refs.flatMap((r) => r.parcelIds).filter(Boolean)
    const entryIds = refs.flatMap((r) => r.entryIds).filter(Boolean)
    const parcelCodes = parcelIds.length ? await this.source.parcelCodesByIds(htxCode, parcelIds) : new Map<string, string>()
    const entryCodes = entryIds.length ? await this.source.parcelCodesOfEntries(htxCode, entryIds) : new Map<string, string>()

    const dayStart = vnDayStart(day)
    const withdrawn = activeWithdrawals(await this.source.withdrawalRows(htxCode, dayStart), dayStart).map((p) => p.parcel_code)

    const proposals = refs.map(({ proposal, parcelIds: ids, entryIds: entries, codes }) => {
      const goal = campaignGoal(proposal)
      const fromIds = ids.map((id) => parcelCodes.get(id)).filter((code): code is string => Boolean(code))
      const fromEntries = entries.map((id) => entryCodes.get(id)).filter((code): code is string => Boolean(code))
      return {
        id: proposal.id,
        kind: proposal.kind,
        risk: proposal.risk,
        title_vi: getAction(proposal.kind)?.titleVi ?? proposal.kind,
        created_at: proposal.createdAt.toISOString(),
        parcel_codes: [...new Set([...fromIds, ...fromEntries, ...codes])],
        goal_key: goal.goalKey,
        target: goal.target,
        // Every kind in today's catalogue is free of spraying and manpower; A8 and mini-app kinds fill these later.
        involves_spraying: false,
        people_needed: 0,
      }
    })

    return {
      day,
      proposals,
      rain_parcel_codes: await this.source.rainParcelCodes(htxCode, now),
      withdrawal_parcel_codes: withdrawn,
      people_available: null,
    }
  }
}
