// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseAssistantIntent } from '@/application/telegram/assistant/intent'
import { assistantResultUseCase } from '@/application/telegram/telegram-services'
import { ValidationError } from '@/domain/errors'
import { PrismaAgentRunRepository } from '@/infrastructure/db/agent/PrismaAgentRunRepository'
import { requireAgentCaller } from '@/lib/api/internal-agent-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

const idSchema = z.string().uuid()
const resultSchema = z.object({
  intent: z.unknown(),
  run_id: z.string().uuid().nullable().optional(),
})

/** Records A7's intent for a claimed request (contract C7): 404 for another cooperative, 409 when not claimed. */
async function postAssistantResult(request: Request, context: unknown) {
  const caller = await requireAgentCaller(request)
  const { params } = context as { params: Promise<{ id: string }> | { id: string } }
  const { id } = await params
  const requestId = idSchema.safeParse(id)
  if (!requestId.success) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Không tìm thấy yêu cầu' } }, { status: 404 })

  const body = resultSchema.parse(await request.json().catch(() => null))
  const runId = body.run_id ?? null
  if (runId && !(await new PrismaAgentRunRepository().existsForHtx(caller.htxCode, runId))) {
    throw new ValidationError('INVALID_RUN_ID')
  }

  const outcome = await assistantResultUseCase().execute(caller.htxCode, requestId.data, parseAssistantIntent(body.intent), runId, new Date())
  if (outcome === 'not_found') return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Không tìm thấy yêu cầu' } }, { status: 404 })
  if (outcome === 'conflict') return NextResponse.json({ error: { code: 'CONFLICT', message: 'Yêu cầu không ở trạng thái đang xử lý' } }, { status: 409 })
  return NextResponse.json({ ok: true })
}

export const POST = withErrorHandler(postAssistantResult)
