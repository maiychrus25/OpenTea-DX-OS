// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { RejectJournalEntryUseCase } from '@/application/journal/RejectJournalEntryUseCase'
import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository'
import { requireTenant } from '@/lib/api/tenant'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { journalReviewSchema } from '@/lib/validations/journal.schema'

async function postJournalReview(request: Request, context: unknown) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }
  const role = session.user.role
  if (role !== 'manager' && role !== 'officer') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Only manager or officer can review journal entries' } }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const parsed = journalReviewSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, { status: 400 })
  }

  const { params } = context as { params: Promise<{ id: string }> | { id: string } }
  const { id } = await params
  await new TenantGuard(await requireTenant()).journalEntry(id)

  const useCase = new RejectJournalEntryUseCase(new PrismaJournalRepository())
  const data = await useCase.execute(id, {
    decision: parsed.data.decision,
    reason: parsed.data.reason,
    reviewerId: session.user.id ?? '',
  })
  return NextResponse.json({ data })
}

export const POST = withErrorHandler(postJournalReview)
