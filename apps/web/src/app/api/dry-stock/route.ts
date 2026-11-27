// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { requireRole } from '@/lib/api/route-helpers'
import { dryStockQuerySchema } from '@/lib/validations/processing.schema'
import { DryStockUseCase } from '@/application/processing/DryStockUseCase'
import { PrismaLotFromBatchesRepository } from '@/infrastructure/db/processing/PrismaLotFromBatchesRepository'

export const dynamic = 'force-dynamic'

async function getDryStock(request: Request) {
  const tenant = await requireTenant()
  requireRole(tenant, 'officer', 'manager')
  const { grade } = dryStockQuerySchema.parse({ grade: new URL(request.url).searchParams.get('grade') || undefined })
  return NextResponse.json({ data: await new DryStockUseCase(new PrismaLotFromBatchesRepository()).execute(tenant, grade) })
}

export const GET = withErrorHandler(getDryStock)
