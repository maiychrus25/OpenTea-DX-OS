// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { appRequestIntake } from '@/application/appbuilder/app-builder-services'
import { requireManagerSession, uuidParam, withAppBuildErrors } from '@/lib/api/app-build-response'

/** Closes a request that has not been approved for building, so the cooperative's one slot is free again. */
async function postCancel(_request: Request, context: unknown) {
  const who = await requireManagerSession()
  await appRequestIntake().cancel(who.tenant.htxCode, await uuidParam(context))
  return NextResponse.json({ data: { status: 'cancelled' } })
}

export const POST = withAppBuildErrors(postCancel)
