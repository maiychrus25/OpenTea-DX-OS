// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { appRequestIntake } from '@/application/appbuilder/app-builder-services'
import { requireManagerSession, uuidParam, withAppBuildErrors } from '@/lib/api/app-build-response'
import { labsOnly } from '@/lib/labs'

/** Closes a request that has not been approved for building, so the cooperative's one slot is free again. */
async function postCancel(_request: Request, context: unknown) {
  const who = await requireManagerSession()
  await appRequestIntake().cancel(who.tenant.htxCode, await uuidParam(context))
  return NextResponse.json({ data: { status: 'cancelled' } })
}

export const POST = withAppBuildErrors(labsOnly(postCancel))

// DXOS_LABS is read per request; a prerendered answer would freeze the switch into the build.
export const dynamic = 'force-dynamic'
