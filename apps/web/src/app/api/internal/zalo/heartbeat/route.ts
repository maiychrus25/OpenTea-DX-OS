// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { zaloRepository } from '@/application/zalo/zalo-services'
import { requireZaloCaller } from '@/lib/api/internal-zalo-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

const heartbeatSchema = z.object({ version: z.string().max(64).optional().nullable() })

async function postZaloHeartbeat(request: Request) {
  await requireZaloCaller(request)
  const body = heartbeatSchema.parse((await request.json().catch(() => ({}))) ?? {})
  await zaloRepository().touchHeartbeat(body.version ?? null)
  return NextResponse.json({ data: { ok: true } })
}

export const POST = withErrorHandler(postZaloHeartbeat)
