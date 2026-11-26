// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { CreateCampaignUseCase, createCampaignSchema } from '@/application/agent/campaign/CreateCampaignUseCase'
import { notifyCampaignCreated } from '@/application/telegram/telegram-services'
import { PrismaAgentRunRepository } from '@/infrastructure/db/agent/PrismaAgentRunRepository'
import { PrismaCampaignRepository } from '@/infrastructure/db/agent/PrismaCampaignRepository'
import { PrismaProposalRepository } from '@/infrastructure/db/agent/PrismaProposalRepository'
import { requireAgentCaller } from '@/lib/api/internal-agent-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

/** A9 posts its campaign (contract C4). The answer is not wrapped in `data`, as the contract shows. */
async function postAgentCampaign(request: Request) {
  const caller = await requireAgentCaller(request)
  const body = createCampaignSchema.parse(await request.json().catch(() => null))
  const result = await new CreateCampaignUseCase({
    campaigns: new PrismaCampaignRepository(),
    proposals: new PrismaProposalRepository(),
    runOwned: (htxCode, runId) => new PrismaAgentRunRepository().existsForHtx(htxCode, runId),
    notify: notifyCampaignCreated,
  }).execute(caller.htxCode, body)

  if (!result.created) return NextResponse.json({ existing: true, id: result.id }, { status: 200 })
  return NextResponse.json({ id: result.id }, { status: 201 })
}

export const POST = withErrorHandler(postAgentCampaign)
