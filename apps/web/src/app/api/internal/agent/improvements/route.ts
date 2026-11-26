// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { CreateImprovementUseCase, createImprovementSchema } from '@/application/agent/improvement/CreateImprovementUseCase'
import { notifyProposalCreated } from '@/application/telegram/telegram-services'
import { PrismaAgentRunRepository } from '@/infrastructure/db/agent/PrismaAgentRunRepository'
import { PrismaImprovementRepository } from '@/infrastructure/db/agent/PrismaImprovementRepository'
import { PrismaProposalRepository } from '@/infrastructure/db/agent/PrismaProposalRepository'
import { requireAgentCaller } from '@/lib/api/internal-agent-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

/** A10 posts one improvement and its proposal (contract C5). Answers sit under `data`, as the other internal routes do. */
async function postInternalImprovement(request: Request) {
  const caller = await requireAgentCaller(request)
  const body = createImprovementSchema.parse(await request.json().catch(() => null))
  const result = await new CreateImprovementUseCase({
    improvements: new PrismaImprovementRepository(),
    proposals: new PrismaProposalRepository(),
    runOwned: (htxCode, runId) => new PrismaAgentRunRepository().existsForHtx(htxCode, runId),
  }).execute(caller.htxCode, body)

  if (result.deduped) return NextResponse.json({ data: { deduped: true } }, { status: 200 })
  await notifyProposalCreated(caller.htxCode, result.proposalId)
  return NextResponse.json({ data: { id: result.id, proposal_id: result.proposalId } }, { status: 201 })
}

export const POST = withErrorHandler(postInternalImprovement)
