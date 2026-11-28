// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { jsonBody } from '@/lib/api/route-helpers'
import { salesListQuerySchema, wholesaleOrderSchema } from '@/lib/validations/sales.schema'
import { CreateWholesaleOrderUseCase, ListSalesOrdersUseCase } from '@/application/sales/SalesUseCases'
import { PrismaSalesRepository } from '@/infrastructure/db/sales/PrismaSalesRepository'

export const dynamic = 'force-dynamic'

async function listOrders(request: Request) {
  const tenant = await requireTenant()
  const params = new URL(request.url).searchParams
  const query = salesListQuerySchema.parse({
    kind: params.get('kind') || undefined,
    status: params.get('status') || undefined,
    overdue: params.get('overdue') || undefined,
    partner_id: params.get('partner_id') || undefined,
    cursor: params.get('cursor') || undefined,
  })
  const result = await new ListSalesOrdersUseCase(new PrismaSalesRepository()).execute(tenant, {
    kind: query.kind, status: query.status, overdue: query.overdue === '1', partnerId: query.partner_id, cursor: query.cursor,
  })
  return NextResponse.json(result)
}

async function createOrder(request: Request) {
  const tenant = await requireTenant()
  const body = wholesaleOrderSchema.parse(await jsonBody(request))
  return NextResponse.json({ data: await new CreateWholesaleOrderUseCase(new PrismaSalesRepository()).execute(tenant, body) }, { status: 201 })
}

export const GET = withErrorHandler(listOrders)
export const POST = withErrorHandler(createOrder)
