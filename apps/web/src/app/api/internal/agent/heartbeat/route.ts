// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { telegramRepository } from '@/application/telegram/telegram-services'
import { AGENT_PROVIDERS } from '@/domain/agent/settings'
import { requireAgentCaller } from '@/lib/api/internal-agent-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

const heartbeatSchema = z.object({
  version: z.string().max(64).optional().nullable(),
  // Providers whose key the agent container holds; the web offers only these in the settings tab.
  providers: z.array(z.enum(AGENT_PROVIDERS)).max(AGENT_PROVIDERS.length).optional(),
})

async function postAgentHeartbeat(request: Request) {
  const caller = await requireAgentCaller(request)
  const body = heartbeatSchema.parse((await request.json().catch(() => ({}))) ?? {})
  await telegramRepository().touchHeartbeat(
    `agent:${caller.htxCode}`,
    body.version ?? null,
    body.providers ? { providers: body.providers } : null
  )
  return NextResponse.json({ data: { ok: true } })
}

export const POST = withErrorHandler(postAgentHeartbeat)
