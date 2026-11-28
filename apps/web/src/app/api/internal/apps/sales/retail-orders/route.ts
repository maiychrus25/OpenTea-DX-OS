// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireAppUserCaller } from '@/lib/api/internal-user-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { jsonBody } from '@/lib/api/route-helpers'
import { retailOrderSchema } from '@/lib/validations/sales.schema'
import { CreateRetailOrderUseCase } from '@/application/sales/SalesUseCases'
import { PrismaSalesRepository } from '@/infrastructure/db/sales/PrismaSalesRepository'

async function createRetailOrder(request: Request) {
  const tenant = await requireAppUserCaller(request)
  const body = retailOrderSchema.parse(await jsonBody(request))
  const { order, created } = await new CreateRetailOrderUseCase(new PrismaSalesRepository()).execute(tenant, body)
  // A replay of the same external_ref returns the first order instead of making a second.
  return NextResponse.json({ data: order }, { status: created ? 201 : 200 })
}

export const POST = withErrorHandler(createRetailOrder)
