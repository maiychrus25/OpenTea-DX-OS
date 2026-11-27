// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { requireTenant } from '@/lib/api/tenant'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { journalUpdateSchema } from '@/lib/validations/journal.schema'
import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository'
import { PrismaPesticideRepository } from '@/infrastructure/db/pesticide/PrismaPesticideRepository'
import { assertJournalPhotoKey } from '@/domain/document/document-namespace'
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
  const tenant = await requireTenant()
  await new TenantGuard(tenant).journalEntry(id)

  const body = await request.json().catch(() => ({}))
  const parse = journalUpdateSchema.safeParse(body)
  if (!parse.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: parse.error.message } }, { status: 400 })
  }

  const repo = new PrismaJournalRepository()
  assertJournalPhotoKey(parse.data.photo_minio_key, tenant.htxCode)
  const useCase = new UpdateJournalEntryUseCase(repo, new PrismaPesticideRepository())
  const householdId = role === 'farmer' ? await getFarmerHouseholdId((session.user as any).id) : undefined
  const { entry_date, ...rest } = parse.data
  const data = await useCase.execute(
    id,
    { ...rest, ...(entry_date ? { entry_date: new Date(entry_date) } : {}) },
    role.toUpperCase(),
    householdId,
    tenant.htxProfileId,
    { id: tenant.userId, name: (session.user as any).name ?? 'Unknown' }
  )
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
  await new TenantGuard(await requireTenant()).journalEntry(id)

  const repo = new PrismaJournalRepository()
  const useCase = new DeleteJournalEntryUseCase(repo)
  const householdId = role === 'farmer' ? await getFarmerHouseholdId((session.user as any).id) : undefined
  await useCase.execute(id, role.toUpperCase(), householdId)
  return NextResponse.json({ data: { deleted: true, withdrawn: role === 'farmer' } })
}

export const PUT = withErrorHandler(putJournalEntry)
export const DELETE = withErrorHandler(deleteJournalEntry)
