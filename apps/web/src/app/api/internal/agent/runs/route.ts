// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { PrismaAgentRunRepository } from '@/infrastructure/db/agent/PrismaAgentRunRepository'
import { requireAgentCaller } from '@/lib/api/internal-agent-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

const startRunSchema = z.object({
  agent: z.string().trim().min(1).max(64),
  trigger: z.enum(['schedule', 'event', 'manual']),
  provider: z.string().trim().min(1).max(64).optional().nullable(),
  model: z.string().trim().min(1).max(128).optional().nullable(),
  prompt_version: z.string().trim().min(1).max(64).optional().nullable(),
  input_hash: z.string().trim().min(1).max(128).optional().nullable(),
})

async function postInternalAgentRun(request: Request) {
  const caller = await requireAgentCaller(request)
  const rawBody = await request.json().catch(() => null)
  const body = startRunSchema.parse(rawBody)

  const repo = new PrismaAgentRunRepository()
  const created = await repo.start({
    htxCode: caller.htxCode,
    agent: body.agent,
    trigger: body.trigger,
    provider: body.provider ?? null,
    model: body.model ?? null,
    promptVersion: body.prompt_version ?? null,
    inputHash: body.input_hash ?? null,
  })

  return NextResponse.json({ data: { id: created.id } }, { status: 201 })
}

export const POST = withErrorHandler(postInternalAgentRun)
