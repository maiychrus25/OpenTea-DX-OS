// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { RecordImprovementEffectUseCase, improvementEffectSchema } from '@/application/agent/improvement/RecordImprovementEffectUseCase'
import { NotFoundError } from '@/domain/errors'
import { PrismaImprovementRepository } from '@/infrastructure/db/agent/PrismaImprovementRepository'
import { requireAgentCaller } from '@/lib/api/internal-agent-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

/** A10's measurement of an adopted improvement after two or four weeks (contract C5). */
async function postInternalImprovementEffect(request: Request, context: unknown) {
  const caller = await requireAgentCaller(request)
  const { params } = context as { params: Promise<{ id: string }> | { id: string } }
  const { id } = await params
  const improvementId = z.string().uuid().parse(id)
  const body = improvementEffectSchema.parse(await request.json().catch(() => null))

  const result = await new RecordImprovementEffectUseCase(new PrismaImprovementRepository()).execute(caller.htxCode, improvementId, body)
  if (result === 'not_found') throw new NotFoundError('Không tìm thấy cải tiến')
  if (result === 'conflict') {
    return NextResponse.json(
      { error: { code: 'CONFLICT', message: 'Cải tiến chưa được áp dụng hoặc đã có số đo cho mốc này' } },
      { status: 409 }
    )
  }
  return NextResponse.json({ data: { id: improvementId, after: body.after } })
}

export const POST = withErrorHandler(postInternalImprovementEffect)
