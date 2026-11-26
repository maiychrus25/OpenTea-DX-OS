// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { ImprovementInputsUseCase } from '@/application/agent/improvement/ImprovementInputsUseCase'
import { weekSchema } from '@/application/agent/improvement/CreateImprovementUseCase'
import { PrismaAgentSettingsRepository } from '@/infrastructure/db/agent/PrismaAgentSettingsRepository'
import { PrismaImprovementRepository } from '@/infrastructure/db/agent/PrismaImprovementRepository'
import { PrismaImprovementStatsReader } from '@/infrastructure/db/agent/PrismaImprovementStatsReader'
import { PrismaStrategyPlanRepository } from '@/infrastructure/db/agent/PrismaStrategyPlanRepository'
import { seasonFigures } from '@/application/agent/strategy/season-figures'
import { requireAgentCaller } from '@/lib/api/internal-agent-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

/** The figures A10 reads before it proposes for a week (contract C3). */
async function getInternalImprovementInputs(request: Request) {
  const caller = await requireAgentCaller(request)
  const week = weekSchema.parse(new URL(request.url).searchParams.get('week'))
  const inputs = await new ImprovementInputsUseCase({
    improvements: new PrismaImprovementRepository(),
    stats: new PrismaImprovementStatsReader(),
    settings: new PrismaAgentSettingsRepository(),
    strategy: { plans: new PrismaStrategyPlanRepository(), figures: (htxCode, season) => seasonFigures(htxCode, season) },
  }).execute(caller.htxCode, week)
  return NextResponse.json({ data: inputs })
}

export const GET = withErrorHandler(getInternalImprovementInputs)
