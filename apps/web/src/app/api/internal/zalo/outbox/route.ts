// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { zaloNotifier } from '@/application/zalo/zalo-services'
import { requireZaloCaller } from '@/lib/api/internal-zalo-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

const LEASE_SECONDS = 60

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(50).catch(20) })

async function getZaloOutbox(request: Request) {
  await requireZaloCaller(request)
  const { limit } = querySchema.parse({ limit: new URL(request.url).searchParams.get('limit') ?? undefined })
  return NextResponse.json({ data: await zaloNotifier().lease(limit, LEASE_SECONDS) })
}

export const GET = withErrorHandler(getZaloOutbox)
