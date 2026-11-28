// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { jsonBody, paramOf } from '@/lib/api/route-helpers'
import { salesPaymentSchema } from '@/lib/validations/sales.schema'
import { AddPaymentUseCase } from '@/application/sales/SalesUseCases'
import { PrismaSalesRepository } from '@/infrastructure/db/sales/PrismaSalesRepository'

async function addPayment(request: Request, context: unknown) {
  const tenant = await requireTenant()
  const body = salesPaymentSchema.parse(await jsonBody(request))
  const id = await paramOf(context)
  await new TenantGuard(tenant).salesOrder(id)
  return NextResponse.json({ data: await new AddPaymentUseCase(new PrismaSalesRepository()).execute(tenant, id, body) }, { status: 201 })
}

export const POST = withErrorHandler(addPayment)
