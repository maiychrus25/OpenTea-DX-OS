// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { decisionUseCase, notifyProposalDecided } from '@/application/telegram/telegram-services'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

const proposalIdSchema = z.string().uuid()

const decisionBodySchema = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().max(500).optional(),
  edited_payload: z.record(z.unknown()).optional(),
})

function formatConflictTime(date: Date): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date)
}

async function postProposalDecision(request: Request, context: unknown) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }
  const tenant = await requireTenant()
  if (tenant.role !== 'manager' && tenant.role !== 'officer') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 })
  }

  const { params } = context as { params: Promise<{ id: string }> | { id: string } }
  const { id } = await params
  if (!proposalIdSchema.safeParse(id).success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Mã đề xuất không hợp lệ' } }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const parsed = decisionBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, { status: 400 })
  }

  const outcome = await decisionUseCase().execute({
    proposalId: id,
    tenant,
    userName: session.user.name || session.user.email || tenant.userId,
    decision: parsed.data.decision,
    note: parsed.data.note,
    editedPayload: parsed.data.edited_payload,
    channel: 'web',
  })

  if (['executed', 'failed', 'rejected', 'stale', 'expired'].includes(outcome.outcome)) {
    await notifyProposalDecided(tenant.htxCode, id)
  }

  if (outcome.outcome === 'stale') {
    return NextResponse.json(
      { error: { code: 'PROPOSAL_STALE', message: 'Dữ liệu nguồn đã thay đổi sau khi đề xuất được tạo.' } },
      { status: 409 }
    )
  }
  if (outcome.outcome === 'expired') {
    return NextResponse.json(
      { error: { code: 'PROPOSAL_EXPIRED', message: 'Đề xuất đã hết hạn.' } },
      { status: 409 }
    )
  }
  if (outcome.outcome === 'already_decided') {
    const actor = outcome.by || 'người dùng khác'
    const timeSuffix = outcome.at ? ` lúc ${formatConflictTime(outcome.at)}` : ''
    return NextResponse.json(
      { error: { code: 'ALREADY_DECIDED', message: `Đề xuất đã được ${actor} xử lý${timeSuffix}.` } },
      { status: 409 }
    )
  }

  return NextResponse.json({ data: outcome })
}

export const POST = withErrorHandler(postProposalDecision)
