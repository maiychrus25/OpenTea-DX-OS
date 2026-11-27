// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { paramOf, requireRole } from '@/lib/api/route-helpers'
import { GetBatch } from '@/application/processing/BatchUseCases'
import { PrismaBatchRepository } from '@/infrastructure/db/processing/PrismaBatchRepository'

export const dynamic = 'force-dynamic'

async function getBatch(_request: Request, context: unknown) {
  const tenant = await requireTenant()
  requireRole(tenant, 'officer', 'manager')
  const id = await paramOf(context)
  await new TenantGuard(tenant).processingBatch(id)
  return NextResponse.json({ data: await new GetBatch(new PrismaBatchRepository()).execute(tenant, id) })
}

export const GET = withErrorHandler(getBatch)
