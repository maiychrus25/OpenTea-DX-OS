// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { appBuilderAgentService } from '@/application/appbuilder/app-builder-services'
import { requireAgentCaller } from '@/lib/api/internal-agent-auth'
import { readJson, uuidParam, withAppBuildErrors } from '@/lib/api/app-build-response'
import { labsOnly } from '@/lib/labs'

/** A12 chose the store or a book: the request is routed and a proposal carries the decision. */
async function postRoute(request: Request, context: unknown) {
  const caller = await requireAgentCaller(request)
  const id = await uuidParam(context)
  const proposalId = await appBuilderAgentService().route(caller.htxCode, id, await readJson(request))
  return NextResponse.json({ data: { proposal_id: proposalId } })
}

export const POST = withAppBuildErrors(labsOnly(postRoute))

// DXOS_LABS is read per request; a prerendered answer would freeze the switch into the build.
export const dynamic = 'force-dynamic'
