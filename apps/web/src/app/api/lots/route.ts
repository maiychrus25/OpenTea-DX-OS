// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { lotCreateSchema } from '@/lib/validations/lot.schema'
import { PrismaLotRepository } from '@/infrastructure/db/lot/PrismaLotRepository'
import { ListLotsUseCase } from '@/application/lot/ListLotsUseCase'
import { CreateLotUseCase } from '@/application/lot/CreateLotUseCase'
import { PrismaParcelRepository } from '@/infrastructure/db/farm/PrismaParcelRepository'
import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository'

async function getLots(request: Request) {
  const { role, htxProfileId } = await requireTenant()
  if (role !== 'officer' && role !== 'manager') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 })
  }

  const url = new URL(request.url)
  const status = url.searchParams.get('status') ?? undefined
  const visibility = url.searchParams.get('visibility') ?? undefined
  const statuses = visibility === 'published' ? ['READY', 'QR_EXPORTED'] : undefined

  const repo = new PrismaLotRepository()
  const useCase = new ListLotsUseCase(repo)
  const data = await useCase.execute({ status, statuses, htx_profile_id: htxProfileId })
  return NextResponse.json({ data })
}

async function postLot(request: Request) {
  const { role, htxProfileId, userId } = await requireTenant()
  if (role !== 'officer') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Only officer can create lots' } }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const parse = lotCreateSchema.safeParse(body)
  if (!parse.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: parse.error.message } }, { status: 400 })
  }

  const lotRepo = new PrismaLotRepository()
  const parcelRepo = new PrismaParcelRepository()
  const journalRepo = new PrismaJournalRepository()
  
  const useCase = new CreateLotUseCase(lotRepo, parcelRepo, journalRepo)
  const data = await useCase.execute({
    commodity: parse.data.crop,
    harvest_date: new Date(parse.data.harvest_date),
    estimated_weight_kg: parse.data.estimated_weight_kg,
    parcel_ids: parse.data.parcel_ids,
    packaging_type: parse.data.packaging_type,
    destination: parse.data.destination,
    buyer_name: parse.data.buyer_name,
    certificate_keys: parse.data.certificate_keys,
    htx_profile_id: htxProfileId,
    created_by_id: userId,
  })
  return NextResponse.json({ data }, { status: 201 })
}

export const GET = withErrorHandler(getLots)
export const POST = withErrorHandler(postLot)
