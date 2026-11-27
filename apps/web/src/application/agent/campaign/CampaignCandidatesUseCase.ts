// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { activeWithdrawals } from '@/domain/journal/active-withdrawals'
import type { ProposalRepository } from '@/domain/agent/ports/ProposalRepository'
import type { Proposal } from '@/domain/agent/proposal'
import type { StrategyPlanRepository } from '@/domain/agent/ports/StrategyPlanRepository'
import { CAMPAIGN_GOAL_OF_SEASON_GOAL, seasonOfDay } from '@/domain/agent/strategy'
import { ensureAppActions, getAction } from '../action-catalog'
import { campaignGoal } from './campaign-goals'
import { vnDayStart } from './vn-day'

const CANDIDATE_LIMIT = 500
const BIG_HARVEST_KG = 500

/** Reads the facts the campaign rules need, always scoped to one cooperative. */
export interface CandidateSource {
  rainParcelCodes(htxCode: string, now: Date): Promise<string[]>
  /** Non-draft spraying activities whose safe harvest date is after `since`. */
  withdrawalRows(htxCode: string, since: Date): Promise<{ parcel_code: string; safe_harvest_date: Date }[]>
  parcelCodesByIds(htxCode: string, parcelIds: string[]): Promise<Map<string, string>>
  parcelCodesOfEntries(htxCode: string, entryIds: string[]): Promise<Map<string, string>>
  /** Estimated harvest in kg (area times estimated yield per hectare) of the parcels that have an estimate. */
  estimatedKgByParcelIds(htxCode: string, parcelIds: string[]): Promise<Map<string, number>>
  /** The present count the staff app reported for a Vietnam day, or null when it reported none. */
  staffPresent(htxCode: string, day: string): Promise<number | null>
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
  /** Campaign goal keys the adopted season plan raises; A9 sorts their items first (M11). */
  season_goal_keys: string[]
}

/** Refs a proposal names: parcel ids (harvest), journal entry ids, or parcel codes already in its payload. */
export function refsOf(proposal: Proposal): { parcelIds: string[]; entryIds: string[]; codes: string[] } {
  const { payload } = proposal
  switch (proposal.kind) {
    case 'staff.task.create':
      return { parcelIds: payload.parcel_id ? [String(payload.parcel_id)] : [], entryIds: [], codes: [] }
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

/** People a proposal takes (contract C5): one for a staff task, two for a harvest over 500 kg. */
function peopleNeeded(kind: string, parcelIds: string[], harvestKg: Map<string, number>): number {
  if (kind === 'staff.task.create') return 1
  if (kind === 'harvest.approve' && parcelIds.some((id) => (harvestKg.get(id) ?? 0) > BIG_HARVEST_KG)) return 2
  return 0
}

/** Serves A9 the open proposals and the facts its rules check, for one Vietnam day (contract C3). */
export class CampaignCandidatesUseCase {
  constructor(
    private readonly proposals: Pick<ProposalRepository, 'list'>,
    private readonly source: CandidateSource,
    private readonly plans?: Pick<StrategyPlanRepository, 'adoptedFor'>
  ) {}

  async execute(htxCode: string, day: string, now: Date = new Date()): Promise<CampaignCandidates> {
    const open = await this.proposals.list(htxCode, { statuses: ['proposed'], limit: CANDIDATE_LIMIT })
    await ensureAppActions(open.map((proposal) => proposal.kind))
    const refs = open.map((proposal) => ({ proposal, ...refsOf(proposal) }))

    const parcelIds = refs.flatMap((r) => r.parcelIds).filter(Boolean)
    const entryIds = refs.flatMap((r) => r.entryIds).filter(Boolean)
    const parcelCodes = parcelIds.length ? await this.source.parcelCodesByIds(htxCode, parcelIds) : new Map<string, string>()
    const entryCodes = entryIds.length ? await this.source.parcelCodesOfEntries(htxCode, entryIds) : new Map<string, string>()

    const harvestIds = refs.filter((r) => r.proposal.kind === 'harvest.approve').flatMap((r) => r.parcelIds).filter(Boolean)
    const harvestKg = harvestIds.length ? await this.source.estimatedKgByParcelIds(htxCode, harvestIds) : new Map<string, number>()

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
        title_vi: getAction(proposal.kind, htxCode)?.titleVi ?? proposal.kind,
        created_at: proposal.createdAt.toISOString(),
        parcel_codes: Array.from(new Set([...fromIds, ...fromEntries, ...codes])),
        goal_key: goal.goalKey,
        target: goal.target,
        // No kind in the catalogue sprays; a staff task takes one person and a big harvest two.
        involves_spraying: false,
        people_needed: peopleNeeded(proposal.kind, ids, harvestKg),
      }
    })

    const plan = this.plans ? await this.plans.adoptedFor(htxCode, seasonOfDay(day)) : null
    const seasonGoalKeys = (plan?.goals ?? []).flatMap((goal) => CAMPAIGN_GOAL_OF_SEASON_GOAL[goal.key] ?? [])

    return {
      day,
      proposals,
      rain_parcel_codes: await this.source.rainParcelCodes(htxCode, now),
      withdrawal_parcel_codes: withdrawn,
      people_available: await this.source.staffPresent(htxCode, day),
      season_goal_keys: seasonGoalKeys,
    }
  }
}
