// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { CHAT_ACTIONS } from '@/application/telegram/chat/actions'
import { CHAT_TOOLS } from '@/application/telegram/chat/tools'
import { assistantRequests } from '@/application/telegram/telegram-services'
import { claimPayload, vietnamDate } from '@/application/telegram/assistant/AssistantRequests'
import { requireAgentCaller } from '@/lib/api/internal-agent-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

const claimSchema = z.object({ limit: z.number().int().min(1).max(5).default(3) })

/** A7 claims the oldest pending chat requests of its cooperative (contract C7). */
async function postAssistantClaim(request: Request) {
  const caller = await requireAgentCaller(request)
  const raw = await request.json().catch(() => ({}))
  const { limit } = claimSchema.parse(raw ?? {})
  const now = new Date()
  const rows = await assistantRequests().claim(caller.htxCode, limit, now)
  return NextResponse.json(claimPayload(rows, CHAT_TOOLS, CHAT_ACTIONS, vietnamDate(now)))
}

export const POST = withErrorHandler(postAssistantClaim)
