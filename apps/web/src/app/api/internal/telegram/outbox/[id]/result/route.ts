// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { telegramNotifier } from '@/application/telegram/telegram-services'
import { NotFoundError } from '@/domain/errors'
import { requireTelegramCaller } from '@/lib/api/internal-telegram-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

const resultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    telegram_message_id: z.union([z.number(), z.string()]).nullable().optional(),
  }),
  z.object({
    ok: z.literal(false),
    error: z.string().min(1).max(1000),
    retry_after_seconds: z.number().int().min(0).max(3600).optional(),
    permanent: z.boolean().optional(),
  }),
])

async function postOutboxResult(request: Request, context: unknown) {
  await requireTelegramCaller(request)
  const { params } = context as { params: Promise<{ id: string }> | { id: string } }
  const { id } = await params
  const body = resultSchema.parse(await request.json().catch(() => null))
  const recorded = await telegramNotifier().recordResult(z.string().uuid().parse(id), body)
  if (!recorded) throw new NotFoundError('Không tìm thấy tin nhắn')
  return NextResponse.json({ data: { recorded: true } })
}

export const POST = withErrorHandler(postOutboxResult)
