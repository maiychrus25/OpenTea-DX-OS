// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { zaloConsents } from '@/application/zalo/zalo-services'
import { requireTenant } from '@/lib/api/tenant'
import { jsonBody, paramOf } from '@/lib/api/route-helpers'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { zaloConsentSchema } from '@/lib/validations/zalo.schema'

/** The household's current wish to receive Zalo messages. */
async function getConsent(_request: Request, context: unknown) {
  const tenant = await requireTenant()
  return NextResponse.json({ data: await zaloConsents().current(tenant, await paramOf(context)) })
}

/** Adds a consent row. The use case decides who may record what; every row keeps who recorded it. */
async function postConsent(request: Request, context: unknown) {
  const tenant = await requireTenant()
  const body = zaloConsentSchema.parse(await jsonBody(request))
  const householdId = await paramOf(context)
  await zaloConsents().execute(tenant, householdId, body)
  return NextResponse.json({ data: await zaloConsents().current(tenant, householdId) })
}

export const GET = withErrorHandler(getConsent)
export const POST = withErrorHandler(postConsent)
