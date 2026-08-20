// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { PrismaLotTraceRepository } from '@/infrastructure/db/repositories/prisma-lot-trace-repository'
import { PrismaLotRepository } from '@/infrastructure/db/lot/PrismaLotRepository'
import { GetLotTraceDataUseCase } from '@/application/useCases/get-lot-trace-data-usecase'

async function getLotDetail(_request: Request, context: unknown) {
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

  // First get lot summary to get lot_code
  const lotRepo = new PrismaLotRepository()
  const lot = await lotRepo.findById(id)
  if (!lot) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Lot not found' } }, { status: 404 })
  }

  // Then get full trace data
  const traceRepo = new PrismaLotTraceRepository()
  const useCase = new GetLotTraceDataUseCase(traceRepo)
  const traceData = await useCase.execute(lot.lot_code)

  return NextResponse.json({ data: { ...lot, trace: traceData } })
}

export const GET = withErrorHandler(getLotDetail)
