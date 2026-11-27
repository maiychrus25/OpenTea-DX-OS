// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { appBuilderAgentService } from '@/application/appbuilder/app-builder-services'
import { requireAgentCaller } from '@/lib/api/internal-agent-auth'
import { readJson, uuidParam, withAppBuildErrors } from '@/lib/api/app-build-response'
import { labsOnly } from '@/lib/labs'

/** The body is the C2 spec. 409 APP_ID_TAKEN when the id is in the catalogue or in a build. */
async function postSpec(request: Request, context: unknown) {
  const caller = await requireAgentCaller(request)
  const id = await uuidParam(context)
  const proposalId = await appBuilderAgentService().proposeSpec(caller.htxCode, id, await readJson(request))
  return NextResponse.json({ data: { proposal_id: proposalId } }, { status: 201 })
}

export const POST = withAppBuildErrors(labsOnly(postSpec))
