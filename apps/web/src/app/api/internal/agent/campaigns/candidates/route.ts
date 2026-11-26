// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { CampaignCandidatesUseCase } from '@/application/agent/campaign/CampaignCandidatesUseCase'
import { vnDayOf } from '@/application/agent/campaign/vn-day'
import { ValidationError } from '@/domain/errors'
import { PrismaCampaignCandidateSource } from '@/infrastructure/db/agent/PrismaCampaignCandidateSource'
import { PrismaProposalRepository } from '@/infrastructure/db/agent/PrismaProposalRepository'
import { requireAgentCaller } from '@/lib/api/internal-agent-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** What A9 reads before it builds the campaign (contract C3). The cooperative comes from the agent token. */
async function getAgentCampaignCandidates(request: Request) {
  const caller = await requireAgentCaller(request)
  const day = new URL(request.url).searchParams.get('day') ?? vnDayOf(new Date())
  if (!DAY_RE.test(day)) throw new ValidationError('INVALID_DAY')
  const candidates = await new CampaignCandidatesUseCase(new PrismaProposalRepository(), new PrismaCampaignCandidateSource()).execute(
    caller.htxCode,
    day
  )
  return NextResponse.json(candidates)
}

export const GET = withErrorHandler(getAgentCampaignCandidates)
