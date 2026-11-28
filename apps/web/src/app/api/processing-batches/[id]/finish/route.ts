// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { jsonBody, paramOf, requireRole } from '@/lib/api/route-helpers'
import { batchFinishSchema } from '@/lib/validations/processing.schema'
import { FinishBatch } from '@/application/processing/BatchUseCases'
import { PrismaBatchRepository } from '@/infrastructure/db/processing/PrismaBatchRepository'

async function handle(request: Request, context: unknown) {
  const tenant = await requireTenant()
  requireRole(tenant, 'officer', 'manager')
  const id = await paramOf(context)
  const body = batchFinishSchema.parse(await jsonBody(request))
  await new TenantGuard(tenant).processingBatch(id)
  return NextResponse.json({ data: await new FinishBatch(new PrismaBatchRepository()).execute(tenant, id, body) })
}

export const POST = withErrorHandler(handle)
