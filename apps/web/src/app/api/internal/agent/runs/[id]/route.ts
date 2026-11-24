// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { PrismaAgentRunRepository } from '@/infrastructure/db/agent/PrismaAgentRunRepository'
import { requireAgentCaller } from '@/lib/api/internal-agent-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

const runIdSchema = z.string().uuid()

const finishRunSchema = z.object({
  status: z.enum(['ok', 'failed', 'skipped']),
  tokens_in: z.number().int().nonnegative().optional().nullable(),
  tokens_out: z.number().int().nonnegative().optional().nullable(),
  cost_estimate: z.number().nonnegative().optional().nullable(),
  error: z.string().max(2000).optional().nullable(),
})

async function patchInternalAgentRun(request: Request, context: unknown) {
  const caller = await requireAgentCaller(request)

  const { params } = context as { params: Promise<{ id: string }> | { id: string } }
  const { id } = await params
  if (!runIdSchema.safeParse(id).success) {
    throw new ValidationError('Invalid run id')
  }

  const rawBody = await request.json().catch(() => null)
  const body = finishRunSchema.parse(rawBody)

  const repo = new PrismaAgentRunRepository()
  const updated = await repo.finish(caller.htxCode, id, {
    status: body.status,
    tokensIn: body.tokens_in ?? null,
    tokensOut: body.tokens_out ?? null,
    costEstimate: body.cost_estimate ?? null,
    error: body.error ?? null,
  })

  if (!updated) {
    throw new NotFoundError('Agent run not found')
  }

  return NextResponse.json({ data: { id, status: body.status } }, { status: 200 })
}

export const PATCH = withErrorHandler(patchInternalAgentRun)
