// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { appBuilderAgentService } from '@/application/appbuilder/app-builder-services'
import { requireAgentCaller } from '@/lib/api/internal-agent-auth'
import { uuidParam, withAppBuildErrors } from '@/lib/api/app-build-response'
import { labsOnly } from '@/lib/labs'

/** A12 calls this for a request that passed or failed; a second call does nothing. */
async function postAnnounce(request: Request, context: unknown) {
  const caller = await requireAgentCaller(request)
  const id = await uuidParam(context)
  const proposalId = await appBuilderAgentService().announce(caller.htxCode, id)
  return NextResponse.json({ data: { proposal_id: proposalId } })
}

export const POST = withAppBuildErrors(labsOnly(postAnnounce))

// DXOS_LABS is read per request; a prerendered answer would freeze the switch into the build.
export const dynamic = 'force-dynamic'
