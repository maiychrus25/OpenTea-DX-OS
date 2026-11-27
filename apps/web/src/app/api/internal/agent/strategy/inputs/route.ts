// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { StrategyInputsUseCase } from '@/application/agent/strategy/StrategyInputsUseCase'
import { seasonFigures } from '@/application/agent/strategy/season-figures'
import { SEASON_PATTERN } from '@/domain/agent/strategy'
import { ValidationError } from '@/domain/errors'
import { PrismaStrategyPlanRepository } from '@/infrastructure/db/agent/PrismaStrategyPlanRepository'
import { requireAgentCaller } from '@/lib/api/internal-agent-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { labsOnly } from '@/lib/labs'

/** The figures A11 reads before it drafts a season (contract C3). */
async function getInternalStrategyInputs(request: Request) {
  const caller = await requireAgentCaller(request)
  const season = new URL(request.url).searchParams.get('season') ?? ''
  if (!SEASON_PATTERN.test(season)) throw new ValidationError('INVALID_SEASON')
  const inputs = await new StrategyInputsUseCase({
    plans: new PrismaStrategyPlanRepository(),
    figures: (htxCode, forSeason) => seasonFigures(htxCode, forSeason),
  }).execute(caller.htxCode, season)
  return NextResponse.json({ data: inputs })
}

export const GET = withErrorHandler(labsOnly(getInternalStrategyInputs))
