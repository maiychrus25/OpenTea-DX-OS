// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { CreateStrategyPlanUseCase, createStrategyPlanSchema } from '@/application/agent/strategy/CreateStrategyPlanUseCase'
import { seasonFigures } from '@/application/agent/strategy/season-figures'
import { notifyProposalCreated } from '@/application/telegram/telegram-services'
import { PrismaAgentRunRepository } from '@/infrastructure/db/agent/PrismaAgentRunRepository'
import { PrismaAutopilotRepository } from '@/infrastructure/db/agent/PrismaAutopilotRepository'
import { PrismaProposalRepository } from '@/infrastructure/db/agent/PrismaProposalRepository'
import { PrismaStrategyPlanRepository } from '@/infrastructure/db/agent/PrismaStrategyPlanRepository'
import { requireAgentCaller } from '@/lib/api/internal-agent-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { labsOnly } from '@/lib/labs'

/** A11 posts a season draft and its proposal (contract C3). Answers sit under `data`, as the other internal routes do. */
async function postInternalStrategyPlan(request: Request) {
  const caller = await requireAgentCaller(request)
  const body = createStrategyPlanSchema.parse(await request.json().catch(() => null))
  const result = await new CreateStrategyPlanUseCase({
    plans: new PrismaStrategyPlanRepository(),
    proposals: new PrismaProposalRepository(),
    autopilot: new PrismaAutopilotRepository(),
    figures: (htxCode, season) => seasonFigures(htxCode, season),
    runOwned: (htxCode, runId) => new PrismaAgentRunRepository().existsForHtx(htxCode, runId),
  }).execute(caller.htxCode, body)

  if (result.existing) return NextResponse.json({ data: { existing: true } }, { status: 200 })
  await notifyProposalCreated(caller.htxCode, result.proposalId)
  return NextResponse.json({ data: { id: result.id, proposal_id: result.proposalId } }, { status: 201 })
}

export const POST = withErrorHandler(labsOnly(postInternalStrategyPlan))

// DXOS_LABS is read per request; a prerendered answer would freeze the switch into the build.
export const dynamic = 'force-dynamic'
