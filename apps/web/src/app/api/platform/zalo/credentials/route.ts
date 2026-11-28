// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { zaloCredentials } from '@/application/zalo/zalo-services'
import { requirePlatformAdmin } from '@/lib/api/platform'
import { jsonBody } from '@/lib/api/route-helpers'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { zaloTokensSchema } from '@/lib/validations/zalo.schema'

/** Whether tokens are stored and the last four characters of the access token. The tokens themselves are never returned. */
async function getCredentials() {
  await requirePlatformAdmin()
  return NextResponse.json({ data: await zaloCredentials().summary() })
}

async function putCredentials(request: Request) {
  const admin = await requirePlatformAdmin()
  const body = zaloTokensSchema.parse(await jsonBody(request))
  await zaloCredentials().save(body, `user:${admin.userId}`)
  return NextResponse.json({ data: await zaloCredentials().summary() })
}

export const GET = withErrorHandler(getCredentials)
export const PUT = withErrorHandler(putCredentials)
