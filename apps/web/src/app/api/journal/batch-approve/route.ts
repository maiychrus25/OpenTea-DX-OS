// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { authFromRequest } from '@/lib/auth/request-user'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { requireTenant } from '@/lib/api/tenant'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { journalBatchApproveSchema } from '@/lib/validations/journal.schema'
import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository'
import { MinioDocumentAdapter } from '@/infrastructure/storage/minio-document.adapter'
import { BatchApproveJournalUseCase } from '@/application/journal/BatchApproveJournalUseCase'

async function postBatchApprove(request: Request) {
  const caller = await authFromRequest(request)
  if (!caller) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }
  const user = caller.user
  const role = user.role
  // AC #2: Both manager and officer can approve journals (Story 9.1, rules-and-limits.md §4.2)
  if (role !== 'manager' && role !== 'officer') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Only manager or officer can batch approve' } }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const parse = journalBatchApproveSchema.safeParse(body)
  if (!parse.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: parse.error.message } }, { status: 400 })
  }

  // Check every entry first so one foreign id approves nothing.
  const tenant = await requireTenant(user)
  const guard = new TenantGuard(tenant)
  for (const entryId of parse.data.entry_ids) await guard.journalEntry(entryId)

  const repo = new PrismaJournalRepository()
  const docStorageRepo = new MinioDocumentAdapter()
  const useCase = new BatchApproveJournalUseCase(repo, docStorageRepo)
  const userId = user.id ?? ''
  const data = await useCase.execute(parse.data.entry_ids, userId, tenant.htxCode)
  return NextResponse.json({ data: { approved_count: data.approved, failed_ids: data.failed } })
}

export const POST = withErrorHandler(postBatchApprove)
