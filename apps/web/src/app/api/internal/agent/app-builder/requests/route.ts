// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { appBuilderAgentService } from '@/application/appbuilder/app-builder-services'
import { requireAgentCaller } from '@/lib/api/internal-agent-auth'
import { withAppBuildErrors } from '@/lib/api/app-build-response'

/** A12's work list: new requests, requests with an answer, and finished requests not yet announced (contract C4). */
async function getRequests(request: Request) {
  const caller = await requireAgentCaller(request)
  return NextResponse.json({ data: { requests: await appBuilderAgentService().waiting(caller.htxCode) } })
}

export const GET = withAppBuildErrors(getRequests)
