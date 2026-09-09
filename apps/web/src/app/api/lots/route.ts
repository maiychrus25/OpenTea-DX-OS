// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { lotCreateSchema } from '@/lib/validations/lot.schema'
import { PrismaLotRepository } from '@/infrastructure/db/lot/PrismaLotRepository'
import { ListLotsUseCase } from '@/application/lot/ListLotsUseCase'
import { CreateLotUseCase } from '@/application/lot/CreateLotUseCase'
import { prisma } from '@/infrastructure/db/prisma.client'
import { PrismaParcelRepository } from '@/infrastructure/db/farm/PrismaParcelRepository'
import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository'

async function getLots(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }
  const role = (session.user as any).role
  if (role !== 'officer' && role !== 'manager') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 })
  }

  // F3 fix: resolve HTX for scoped query — prevents cross-HTX data leakage (AC10)
  const htx = await prisma.htxProfile.findFirst()
  if (!htx) {
    // No HTX configured — return empty list rather than leaking all lots
    return NextResponse.json({ data: [] })
  }

  const url = new URL(request.url)
  const status = url.searchParams.get('status') ?? undefined
  const visibility = url.searchParams.get('visibility') ?? undefined
  const statuses = visibility === 'published' ? ['READY', 'QR_EXPORTED'] : undefined

  const repo = new PrismaLotRepository()
  const useCase = new ListLotsUseCase(repo)
  const data = await useCase.execute({ status, statuses, htx_profile_id: htx.id })
  return NextResponse.json({ data })
}

async function postLot(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }
  const role = (session.user as any).role
  if (role !== 'officer') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Only officer can create lots' } }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const parse = lotCreateSchema.safeParse(body)
  if (!parse.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: parse.error.message } }, { status: 400 })
  }

  const htx = await prisma.htxProfile.findFirst()
  if (!htx) {
    return NextResponse.json({ error: { code: 'DOMAIN_ERROR', message: 'HTX Profile not found' } }, { status: 422 })
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
    htx_profile_id: htx.id,
    created_by_id: (session.user as any).id ?? '',
  })
  return NextResponse.json({ data }, { status: 201 })
}

export const GET = withErrorHandler(getLots)
export const POST = withErrorHandler(postLot)
