// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { jsonBody, requireRole } from '@/lib/api/route-helpers'
import { batchCreateSchema, batchListQuerySchema } from '@/lib/validations/processing.schema'
import { CreateBatch, ListBatches } from '@/application/processing/BatchUseCases'
import { PrismaBatchRepository } from '@/infrastructure/db/processing/PrismaBatchRepository'

export const dynamic = 'force-dynamic'

async function listBatches(request: Request) {
  const tenant = await requireTenant()
  requireRole(tenant, 'officer', 'manager')
  const params = new URL(request.url).searchParams
  const query = batchListQuerySchema.parse({ status: params.get('status') || undefined, from: params.get('from') || undefined, to: params.get('to') || undefined })
  return NextResponse.json({ data: await new ListBatches(new PrismaBatchRepository()).execute(tenant, query) })
}

async function createBatch(request: Request) {
  const tenant = await requireTenant()
  requireRole(tenant, 'officer', 'manager')
  const body = batchCreateSchema.parse(await jsonBody(request))
  return NextResponse.json({ data: await new CreateBatch(new PrismaBatchRepository()).execute(tenant, body) }, { status: 201 })
}

export const GET = withErrorHandler(listBatches)
export const POST = withErrorHandler(createBatch)
