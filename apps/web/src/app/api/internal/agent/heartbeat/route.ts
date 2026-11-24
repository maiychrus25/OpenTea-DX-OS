// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { telegramRepository } from '@/application/telegram/telegram-services'
import { requireAgentCaller } from '@/lib/api/internal-agent-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

const heartbeatSchema = z.object({ version: z.string().max(64).optional().nullable() })

async function postAgentHeartbeat(request: Request) {
  const caller = await requireAgentCaller(request)
  const body = heartbeatSchema.parse((await request.json().catch(() => ({}))) ?? {})
  await telegramRepository().touchHeartbeat(`agent:${caller.htxCode}`, body.version ?? null)
  return NextResponse.json({ data: { ok: true } })
}

export const POST = withErrorHandler(postAgentHeartbeat)
