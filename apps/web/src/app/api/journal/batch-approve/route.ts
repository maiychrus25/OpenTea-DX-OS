// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { journalBatchApproveSchema } from '@/lib/validations/journal.schema'
import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository'
import { BatchApproveJournalUseCase } from '@/application/journal/BatchApproveJournalUseCase'

async function postBatchApprove(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }
  const role = (session.user as any).role
  // AC #2: Both manager and officer can approve journals (Story 9.1, rules-and-limits.md §4.2)
  if (role !== 'manager' && role !== 'officer') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Only manager or officer can batch approve' } }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const parse = journalBatchApproveSchema.safeParse(body)
  if (!parse.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: parse.error.message } }, { status: 400 })
  }

  const repo = new PrismaJournalRepository()
  const useCase = new BatchApproveJournalUseCase(repo)
  const userId = (session.user as any).id ?? ''
  const data = await useCase.execute(parse.data.entry_ids, userId)
  return NextResponse.json({ data: { approved_count: data.approved, failed_ids: data.failed } })
}

export const POST = withErrorHandler(postBatchApprove)
