// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assistantRequests, telegramNotifier, telegramRepository } from '@/application/telegram/telegram-services'
import { assistantTimeoutInserts } from '@/application/telegram/assistant/AssistantResult'
import { telegramCallbackKey } from '@/application/telegram/telegram-config'
import { requireTelegramCaller } from '@/lib/api/internal-telegram-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

const LEASE_SECONDS = 60

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).catch(20),
})

async function getTelegramOutbox(request: Request) {
  await requireTelegramCaller(request)
  const { limit } = querySchema.parse({ limit: new URL(request.url).searchParams.get('limit') ?? undefined })
  await telegramNotifier().runHealthChecks()
  // Assistant requests older than 60 s expire here, and their chats get the timeout reply with the menu (contract C7).
  const expired = await assistantRequests().expire(new Date())
  await telegramRepository().enqueue(assistantTimeoutInserts(expired, telegramCallbackKey()))
  const rows = await telegramRepository().lease(limit, new Date(), LEASE_SECONDS)
  return NextResponse.json({
    data: rows.map((row) => ({
      id: row.id,
      op: row.op,
      chat_id: Number(row.chatId),
      text: row.text,
      ...(row.buttons ? { buttons: row.buttons } : {}),
      ...(row.editMessageId ? { edit_message_id: Number(row.editMessageId) } : {}),
    })),
  })
}

export const GET = withErrorHandler(getTelegramOutbox)
