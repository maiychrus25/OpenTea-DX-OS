// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { jsonBody, requireRole } from '@/lib/api/route-helpers'
import { lotFromBatchesSchema } from '@/lib/validations/processing.schema'
import { CreateLotFromBatchesUseCase } from '@/application/processing/CreateLotFromBatchesUseCase'
import { PrismaLotFromBatchesRepository } from '@/infrastructure/db/processing/PrismaLotFromBatchesRepository'

async function createLotFromBatches(request: Request) {
  const tenant = await requireTenant()
  requireRole(tenant, 'officer', 'manager')
  const body = lotFromBatchesSchema.parse(await jsonBody(request))
  // The use case checks every output row belongs to the HTX, under lock; a foreign id is a STOCK_CHANGED.
  return NextResponse.json({ data: await new CreateLotFromBatchesUseCase(new PrismaLotFromBatchesRepository()).execute(tenant, body) }, { status: 201 })
}

export const POST = withErrorHandler(createLotFromBatches)
