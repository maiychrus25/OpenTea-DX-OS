// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { PlanGoal, PlanInitiative, StrategyPlan } from '@/domain/agent/strategy'

export interface NewStrategyPlan {
  htxCode: string
  season: string
  goals: PlanGoal[]
  priorities: string[]
  initiatives: PlanInitiative[]
  warnings: string[]
  runId: string | null
}

export type AdoptResult = 'adopted' | 'not_found' | 'not_draft'

export interface StrategyPlanRepository {
  /** Inserts a draft unless the cooperative already has a draft for the season; null when it has. */
  insertDraftIfNone(input: NewStrategyPlan): Promise<{ id: string } | null>
  /** Deletes a draft whose proposal could not be created. */
  remove(htxCode: string, id: string): Promise<void>
  linkProposal(htxCode: string, id: string, proposalId: string): Promise<void>
  findById(htxCode: string, id: string): Promise<StrategyPlan | null>
  draftExists(htxCode: string, season: string): Promise<boolean>
  /** The adopted plan of a season, or null. */
  adoptedFor(htxCode: string, season: string): Promise<StrategyPlan | null>
  /** Adopts a draft and supersedes the season's previous adopted plan, in one transaction. */
  adopt(htxCode: string, id: string, decidedBy: string, at: Date): Promise<AdoptResult>
}
