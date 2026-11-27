// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { appBuilderAgentService } from '@/application/appbuilder/app-builder-services'
import { requireAgentCaller } from '@/lib/api/internal-agent-auth'
import { uuidParam, withAppBuildErrors } from '@/lib/api/app-build-response'

/** A12 calls this for a request that passed or failed; a second call does nothing. */
async function postAnnounce(request: Request, context: unknown) {
  const caller = await requireAgentCaller(request)
  const id = await uuidParam(context)
  const proposalId = await appBuilderAgentService().announce(caller.htxCode, id)
  return NextResponse.json({ data: { proposal_id: proposalId } })
}

export const POST = withAppBuildErrors(postAnnounce)
