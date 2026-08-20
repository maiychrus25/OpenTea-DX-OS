// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { parcelCreateSchema } from '@/lib/validations/parcel.schema'
import { PrismaParcelRepository } from '@/infrastructure/db/farm/PrismaParcelRepository'
import { ListParcelsUseCase } from '@/application/farm/ListParcelsUseCase'
import { CreateParcelUseCase } from '@/application/farm/CreateParcelUseCase'

async function getParcels(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }

  const url = new URL(request.url)
  const householdId = url.searchParams.get('household_id') ?? undefined
  const status = url.searchParams.get('status') ?? undefined

  const role = (session.user as any).role
  const userHouseholdId = role === 'farmer' ? (session.user as any).household_id : undefined

  const repo = new PrismaParcelRepository()
  const useCase = new ListParcelsUseCase(repo)
  const data = await useCase.execute({ household_id: householdId, status }, role.toUpperCase(), userHouseholdId)
  return NextResponse.json({ data })
}

async function postParcel(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }
  const role = (session.user as any).role
  if (role !== 'officer') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Only officer can create parcels' } }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const parse = parcelCreateSchema.safeParse(body)
  if (!parse.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: parse.error.message } }, { status: 400 })
  }

  const repo = new PrismaParcelRepository()
  const useCase = new CreateParcelUseCase(repo)
  const data = await useCase.execute(parse.data)
  return NextResponse.json({ data }, { status: 201 })
}

export const GET = withErrorHandler(getParcels)
export const POST = withErrorHandler(postParcel)
