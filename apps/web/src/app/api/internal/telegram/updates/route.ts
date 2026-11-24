// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { telegramUpdateHandler } from '@/application/telegram/telegram-services'
import { requireTelegramCaller } from '@/lib/api/internal-telegram-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

const chatSchema = z.object({ id: z.number(), type: z.string() })

const updateSchema = z.object({
  update_id: z.number().int(),
  message: z
    .object({
      message_id: z.number().optional(),
      chat: chatSchema,
      from: z.object({ id: z.number() }).optional(),
      text: z.string().max(4096).optional(),
    })
    .optional(),
  callback_query: z
    .object({
      id: z.string().min(1).max(64),
      from: z.object({ id: z.number() }),
      message: z.object({ message_id: z.number().optional(), chat: chatSchema }),
      data: z.string().max(64),
    })
    .optional(),
})

async function postTelegramUpdate(request: Request) {
  await requireTelegramCaller(request)
  const body = updateSchema.parse(await request.json().catch(() => null))
  const result = await telegramUpdateHandler().handle(body)
  return NextResponse.json({ data: result })
}

export const POST = withErrorHandler(postTelegramUpdate)
