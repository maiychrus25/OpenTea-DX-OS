// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { journalUpdateSchema } from '@/lib/validations/journal.schema'
import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository'
import { UpdateJournalEntryUseCase } from '@/application/journal/UpdateJournalEntryUseCase'
import { DeleteJournalEntryUseCase } from '@/application/journal/DeleteJournalEntryUseCase'

async function putJournalEntry(request: Request, context: unknown) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }
  const role = (session.user as any).role
  if (role !== 'officer' && role !== 'farmer') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 })
  }

  const { params } = context as { params: Promise<{ id: string }> }
  const { id } = await params

  const body = await request.json().catch(() => ({}))
  const parse = journalUpdateSchema.safeParse(body)
  if (!parse.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: parse.error.message } }, { status: 400 })
  }

  const repo = new PrismaJournalRepository()
  const useCase = new UpdateJournalEntryUseCase(repo)
  const data = await useCase.execute(id, parse.data)
  return NextResponse.json({ data })
}

async function deleteJournalEntry(_request: Request, context: unknown) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }
  const role = (session.user as any).role
  if (role !== 'officer' && role !== 'farmer') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 })
  }

  const { params } = context as { params: Promise<{ id: string }> }
  const { id } = await params

  const repo = new PrismaJournalRepository()
  const useCase = new DeleteJournalEntryUseCase(repo)
  await useCase.execute(id)
  return NextResponse.json({ data: { deleted: true } })
}

export const PUT = withErrorHandler(putJournalEntry)
export const DELETE = withErrorHandler(deleteJournalEntry)
