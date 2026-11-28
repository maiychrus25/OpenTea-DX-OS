// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { zaloCredentials } from '@/application/zalo/zalo-services'
import { requireZaloCaller } from '@/lib/api/internal-zalo-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { zaloTokensSchema } from '@/lib/validations/zalo.schema'

/** The OA tokens for the relay, or null before an admin entered them. Never logged. */
async function getZaloCredentials(request: Request) {
  await requireZaloCaller(request)
  return NextResponse.json({ data: await zaloCredentials().forRelay() })
}

/** The relay stores the tokens it refreshed; they are encrypted before they reach the database. */
async function postZaloCredentials(request: Request) {
  await requireZaloCaller(request)
  const body = zaloTokensSchema.parse(await request.json().catch(() => null))
  await zaloCredentials().save(body, 'service:zalo')
  return NextResponse.json({ data: { ok: true } })
}

export const GET = withErrorHandler(getZaloCredentials)
export const POST = withErrorHandler(postZaloCredentials)
