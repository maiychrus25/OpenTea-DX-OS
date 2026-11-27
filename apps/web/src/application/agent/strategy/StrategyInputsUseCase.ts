// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { StrategyPlanRepository } from '@/domain/agent/ports/StrategyPlanRepository'
import { previousSeason, sameQuarterLastYear, type Figures } from '@/domain/agent/strategy'

export interface StrategyInputs {
  season: string
  current: Figures
  last_year: Figures
  previous: Figures
  adopted: { id: string; season: string } | null
  draft_exists: boolean
}

export interface StrategyInputsDeps {
  plans: Pick<StrategyPlanRepository, 'adoptedFor' | 'draftExists'>
  figures(htxCode: string, season: string): Promise<Figures>
}

/** The figures A11 reads before it drafts a season (contract C3). */
export class StrategyInputsUseCase {
  constructor(private readonly deps: StrategyInputsDeps) {}

  async execute(htxCode: string, season: string): Promise<StrategyInputs> {
    const [current, lastYear, previous, adopted, draftExists] = await Promise.all([
      this.deps.figures(htxCode, season),
      this.deps.figures(htxCode, sameQuarterLastYear(season)),
      this.deps.figures(htxCode, previousSeason(season)),
      this.deps.plans.adoptedFor(htxCode, season),
      this.deps.plans.draftExists(htxCode, season),
    ])
    return {
      season,
      current,
      last_year: lastYear,
      previous,
      adopted: adopted ? { id: adopted.id, season: adopted.season } : null,
      draft_exists: draftExists,
    }
  }
}
