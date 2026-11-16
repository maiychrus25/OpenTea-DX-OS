// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { authFromRequest } from '@/lib/auth/request-user'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { requireTenant } from '@/lib/api/tenant'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { journalUpdateSchema } from '@/lib/validations/journal.schema'
import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository'
import { UpdateJournalEntryUseCase } from '@/application/journal/UpdateJournalEntryUseCase'
import { DeleteJournalEntryUseCase } from '@/application/journal/DeleteJournalEntryUseCase'
import { GetFarmerHouseholdUseCase } from '@/application/farm/GetFarmerHouseholdUseCase'
import { PrismaHouseholdRepository } from '@/infrastructure/db/farm/PrismaHouseholdRepository'

async function getFarmerHouseholdId(userId?: string) {
  if (!userId) return undefined
  const useCase = new GetFarmerHouseholdUseCase(new PrismaHouseholdRepository())
  const household = await useCase.execute(userId)
  return household?.id
}

async function putJournalEntry(request: Request, context: unknown) {
  const caller = await authFromRequest(request)
  if (!caller) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }
  const user = caller.user
  const role = user.role
  if (role !== 'officer' && role !== 'farmer') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 })
  }

  const { params } = context as { params: Promise<{ id: string }> }
  const { id } = await params
  await new TenantGuard(await requireTenant(user)).journalEntry(id)

  const body = await request.json().catch(() => ({}))
  const parse = journalUpdateSchema.safeParse(body)
  if (!parse.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: parse.error.message } }, { status: 400 })
  }

  const repo = new PrismaJournalRepository()
  const useCase = new UpdateJournalEntryUseCase(repo)
  const householdId = role === 'farmer' ? await getFarmerHouseholdId(user.id) : undefined
  const data = await useCase.execute(id, parse.data, role.toUpperCase(), householdId)
  return NextResponse.json({ data })
}

async function deleteJournalEntry(request: Request, context: unknown) {
  const caller = await authFromRequest(request)
  if (!caller) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }
  const user = caller.user
  const role = user.role
  if (role !== 'officer' && role !== 'farmer') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 })
  }

  const { params } = context as { params: Promise<{ id: string }> }
  const { id } = await params
  await new TenantGuard(await requireTenant(user)).journalEntry(id)

  const repo = new PrismaJournalRepository()
  const useCase = new DeleteJournalEntryUseCase(repo)
  const householdId = role === 'farmer' ? await getFarmerHouseholdId(user.id) : undefined
  await useCase.execute(id, role.toUpperCase(), householdId)
  return NextResponse.json({ data: { deleted: true, withdrawn: role === 'farmer' } })
}

export const PUT = withErrorHandler(putJournalEntry)
export const DELETE = withErrorHandler(deleteJournalEntry)
