// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { parcelUpdateSchema } from '@/lib/validations/parcel.schema'
import { PrismaParcelRepository } from '@/infrastructure/db/farm/PrismaParcelRepository'
import { UpdateParcelUseCase } from '@/application/farm/UpdateParcelUseCase'
import { DeleteParcelUseCase } from '@/application/farm/DeleteParcelUseCase'

async function putParcel(request: Request, context: unknown) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }
  const role = (session.user as any).role
  if (role !== 'officer') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Only officer can update parcels' } }, { status: 403 })
  }

  const { params } = context as { params: Promise<{ id: string }> }
  const { id } = await params

  const body = await request.json().catch(() => ({}))
  const parse = parcelUpdateSchema.safeParse(body)
  if (!parse.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: parse.error.message } }, { status: 400 })
  }

  const repo = new PrismaParcelRepository()
  const useCase = new UpdateParcelUseCase(repo)
  const data = await useCase.execute(id, parse.data)
  return NextResponse.json({ data })
}

async function deleteParcel(_request: Request, context: unknown) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }
  const role = (session.user as any).role
  if (role !== 'officer' && role !== 'manager') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 })
  }

  const { params } = context as { params: Promise<{ id: string }> }
  const { id } = await params

  const repo = new PrismaParcelRepository()
  const useCase = new DeleteParcelUseCase(repo)
  await useCase.execute(id)
  return NextResponse.json({ data: { deleted: true } })
}

export const PUT = withErrorHandler(putParcel)
export const DELETE = withErrorHandler(deleteParcel)
