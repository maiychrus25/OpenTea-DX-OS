// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { jsonBody, paramOf, requireRole } from '@/lib/api/route-helpers'
import { salesCancelSchema } from '@/lib/validations/sales.schema'
import { CancelOrderUseCase } from '@/application/sales/SalesUseCases'
import { PrismaSalesRepository } from '@/infrastructure/db/sales/PrismaSalesRepository'

async function cancelOrder(request: Request, context: unknown) {
  const tenant = await requireTenant()
  requireRole(tenant, 'manager')
  const body = salesCancelSchema.parse(await jsonBody(request))
  const id = await paramOf(context)
  await new TenantGuard(tenant).salesOrder(id)
  return NextResponse.json({ data: await new CancelOrderUseCase(new PrismaSalesRepository()).execute(tenant, id, body.reason) })
}

export const POST = withErrorHandler(cancelOrder)
