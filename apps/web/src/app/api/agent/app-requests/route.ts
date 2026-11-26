// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { appRequestIntake } from '@/application/appbuilder/app-builder-services'
import { readJson, requireManagerSession, withAppBuildErrors } from '@/lib/api/app-build-response'

const bodySchema = z.object({ request_text: z.string() })

/** A manager asks for an app; the HTX and the requester come from the session (contract C4). */
async function postAppRequest(request: Request) {
  const who = await requireManagerSession()
  const body = bodySchema.parse(await readJson(request))
  const created = await appRequestIntake().create(
    { htxCode: who.tenant.htxCode, userId: who.tenant.userId, userName: who.userName },
    body.request_text
  )
  return NextResponse.json({ data: { id: created.id, status: created.status } }, { status: 201 })
}

export const POST = withAppBuildErrors(postAppRequest)
