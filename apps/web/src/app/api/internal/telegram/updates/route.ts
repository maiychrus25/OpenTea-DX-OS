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
      caption: z.string().max(1024).optional(),
      // Contract C1: a photo is at most 5 MB, so its base64 form stays under 7 000 000 characters.
      photo: z
        .object({
          mime_type: z.literal('image/jpeg'),
          data_base64: z.string().max(7_000_000),
          file_unique_id: z.string().min(1).max(128),
        })
        .optional(),
      photo_error: z.enum(['too_large', 'download_failed']).optional(),
      // Contract C2: the relay sends the heard text (at most 500 characters), never the audio.
      voice_text: z.string().max(500).optional(),
      voice_duration: z.number().min(0).max(3600).optional(),
      voice_error: z.enum(['too_long', 'stt_unavailable']).optional(),
      location: z
        .object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })
        .optional(),
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
