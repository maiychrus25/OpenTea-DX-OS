// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { jsonBody, paramOf } from '@/lib/api/route-helpers'
import { salesDueSchema } from '@/lib/validations/sales.schema'
import { GetSalesOrderUseCase, UpdateDueDateUseCase } from '@/application/sales/SalesUseCases'
import { PrismaSalesRepository } from '@/infrastructure/db/sales/PrismaSalesRepository'

export const dynamic = 'force-dynamic'

async function getOrder(_request: Request, context: unknown) {
  const tenant = await requireTenant()
  const id = await paramOf(context)
  await new TenantGuard(tenant).salesOrder(id)
  return NextResponse.json({ data: await new GetSalesOrderUseCase(new PrismaSalesRepository()).execute(tenant, id) })
}

async function changeDue(request: Request, context: unknown) {
  const tenant = await requireTenant()
  const body = salesDueSchema.parse(await jsonBody(request))
  const id = await paramOf(context)
  await new TenantGuard(tenant).salesOrder(id)
  return NextResponse.json({ data: await new UpdateDueDateUseCase(new PrismaSalesRepository()).execute(tenant, id, body.due_on) })
}

export const GET = withErrorHandler(getOrder)
export const PATCH = withErrorHandler(changeDue)
