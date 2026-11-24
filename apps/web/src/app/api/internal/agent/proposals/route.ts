// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { CreateProposalUseCase } from '@/application/agent/CreateProposalUseCase'
import { ValidationError } from '@/domain/errors'
import { PrismaAgentRunRepository } from '@/infrastructure/db/agent/PrismaAgentRunRepository'
import { PrismaProposalRepository } from '@/infrastructure/db/agent/PrismaProposalRepository'
import { requireAgentCaller } from '@/lib/api/internal-agent-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

const createProposalSchema = z.object({
  run_id: z.string().uuid().optional().nullable(),
  agent: z.string().trim().min(1).max(64),
  kind: z.string().trim().min(1).max(128),
  payload: z.record(z.unknown()),
  reason_vi: z.string().trim().min(1).max(1000),
  evidence: z.object({
    rows: z.array(
      z.object({
        table: z.string().min(1),
        id: z.string().min(1),
        sha256: z.string().min(1),
        values: z.record(z.unknown()).optional(),
      })
    ),
    sha256: z.string().min(1),
  }),
  confidence: z.number().min(0).max(1).optional().nullable(),
  dedupe_key: z.string().trim().min(1).max(255).optional(),
})

async function postInternalAgentProposal(request: Request) {
  const caller = await requireAgentCaller(request)
  const rawBody = await request.json().catch(() => null)
  const body = createProposalSchema.parse(rawBody)

  if (body.run_id) {
    const runOwned = await new PrismaAgentRunRepository().existsForHtx(caller.htxCode, body.run_id)
    if (!runOwned) {
      throw new ValidationError('INVALID_RUN_ID')
    }
  }

  const useCase = new CreateProposalUseCase(new PrismaProposalRepository())
  const created = await useCase.execute({
    htxCode: caller.htxCode,
    runId: body.run_id ?? null,
    agent: body.agent,
    kind: body.kind,
    payload: body.payload,
    reasonVi: body.reason_vi,
    evidence: body.evidence,
    confidence: body.confidence ?? null,
    origin: 'agent',
    dedupeKey: body.dedupe_key,
  })

  if (!created) {
    return NextResponse.json({ data: { id: null, deduped: true } }, { status: 200 })
  }

  return NextResponse.json({ data: { id: created.id, deduped: false } }, { status: 201 })
}

export const POST = withErrorHandler(postInternalAgentProposal)
