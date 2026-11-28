// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireAppUserCaller } from '@/lib/api/internal-user-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { jsonBody, paramOf } from '@/lib/api/route-helpers'
import { retailCancelSchema, retailOrderSchema } from '@/lib/validations/sales.schema'
import { CancelRetailOrderUseCase } from '@/application/sales/SalesUseCases'
import { PrismaSalesRepository } from '@/infrastructure/db/sales/PrismaSalesRepository'

async function cancelRetailOrder(request: Request, context: unknown) {
  const tenant = await requireAppUserCaller(request)
  const body = retailCancelSchema.parse(await jsonBody(request))
  const data = await new CancelRetailOrderUseCase(new PrismaSalesRepository()).execute(tenant, retailOrderSchema.shape.external_ref.parse(await paramOf(context, 'external_ref')), body.reason)
  return NextResponse.json({ data })
}

export const POST = withErrorHandler(cancelRetailOrder)
