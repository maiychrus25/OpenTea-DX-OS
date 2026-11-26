// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { StaffInputsUseCase } from '@/application/agent/staff/StaffInputsUseCase'
import { PrismaCampaignCandidateSource } from '@/infrastructure/db/agent/PrismaCampaignCandidateSource'
import { PrismaProposalRepository } from '@/infrastructure/db/agent/PrismaProposalRepository'
import { PrismaStaffSyncRepository } from '@/infrastructure/db/agent/PrismaStaffSyncRepository'
import { requireAgentCaller } from '@/lib/api/internal-agent-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

/** What A8 reads before it proposes staff tasks (contract C4). The cooperative comes from the agent token. */
async function getAgentStaffInputs(request: Request) {
  const caller = await requireAgentCaller(request)
  const source = new PrismaCampaignCandidateSource()
  const inputs = await new StaffInputsUseCase(new PrismaProposalRepository(), new PrismaStaffSyncRepository(), (htx, ids, codes) =>
    source.parcelsByIdsOrCodes(htx, ids, codes)
  ).execute(caller.htxCode)
  return NextResponse.json({ data: inputs })
}

export const GET = withErrorHandler(getAgentStaffInputs)
