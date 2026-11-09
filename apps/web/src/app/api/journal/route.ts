// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { requireTenant } from '@/lib/api/tenant'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { journalCreateSchema } from '@/lib/validations/journal.schema'
import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository'
import { ListJournalEntriesUseCase } from '@/application/journal/ListJournalEntriesUseCase'
import { CreateJournalEntryUseCase } from '@/application/journal/CreateJournalEntryUseCase'
import { PrismaParcelRepository } from '@/infrastructure/db/farm/PrismaParcelRepository'
import { GetFarmerHouseholdUseCase } from '@/application/farm/GetFarmerHouseholdUseCase'
import { PrismaHouseholdRepository } from '@/infrastructure/db/farm/PrismaHouseholdRepository'

async function getFarmerHouseholdId(userId?: string) {
  if (!userId) return undefined
  const useCase = new GetFarmerHouseholdUseCase(new PrismaHouseholdRepository())
  const household = await useCase.execute(userId)
  return household?.id
}

async function getJournalEntries(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }

  const url = new URL(request.url)
  const parcelId = url.searchParams.get('parcel_id') ?? undefined
  const status = url.searchParams.get('status') ?? undefined
  const page = parseInt(url.searchParams.get('page') ?? '1', 10)
  const limit = parseInt(url.searchParams.get('limit') ?? '20', 10)

  // Lấy tạm role do NextAuth type chưa extend
  const role = (session.user as any).role
  // Farmer can only see their own household's entries
  // Officer/Manager can optionally filter by householdId query param
  let householdId: string | undefined
  if (role === 'farmer') {
    householdId = await getFarmerHouseholdId((session.user as any).id)
  } else {
    householdId = url.searchParams.get('householdId') ?? undefined
  }

  const repo = new PrismaJournalRepository()
  const useCase = new ListJournalEntriesUseCase(repo)
  const result = await useCase.execute({
    parcel_id: parcelId,
    status,
    page,
    limit,
    household_id: householdId,
  })

  // Attach presigned url for photos
  const { MinioDocumentAdapter } = await import('@/infrastructure/storage/minio-document.adapter')
  const storage = new MinioDocumentAdapter()
  for (const entry of result.entries) {
    if (entry.photo_minio_key) {
      entry.photo_url = await storage.generateDownloadUrl(entry.photo_minio_key)
    }
  }

  return NextResponse.json({ data: result.entries, meta: { page, total: result.total } })
}

async function postJournalEntry(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }
  // Lấy tạm role do NextAuth type chưa extend
  const role = (session.user as any).role
  if (role !== 'officer' && role !== 'farmer') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Only officer/farmer can create journal entries' } }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const parse = journalCreateSchema.safeParse(body)
  if (!parse.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: parse.error.message } }, { status: 400 })
  }

  await new TenantGuard(await requireTenant()).parcel(parse.data.parcel_id)

  const repo = new PrismaJournalRepository()
  const parcelRepo = new PrismaParcelRepository()
  const useCase = new CreateJournalEntryUseCase(repo, parcelRepo)
  const data = await useCase.execute({
    parcel_id: parse.data.parcel_id,
    entry_date: new Date(parse.data.entry_date),
    activity_type: parse.data.activities[0]?.activity_type ?? 'OTHER',
    performed_by: (session.user as any).name ?? 'Unknown',
    submitted_by_id: (session.user as any).id ?? '',
    submitted_role: role.toUpperCase() as 'OFFICER' | 'FARMER',
    activities: parse.data.activities,
    observation: parse.data.observation,
    photo_url: parse.data.photo_url,
    photo_minio_key: parse.data.photo_minio_key,
  }, role.toUpperCase(), role === 'farmer' ? await getFarmerHouseholdId((session.user as any).id) : undefined)
  
  return NextResponse.json({ data }, { status: 201 })
}

export const GET = withErrorHandler(getJournalEntries)
export const POST = withErrorHandler(postJournalEntry)
