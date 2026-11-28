// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireAppUserCaller } from '@/lib/api/internal-user-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { ListSellableLotsUseCase } from '@/application/sales/SalesUseCases'
import { PrismaSalesRepository } from '@/infrastructure/db/sales/PrismaSalesRepository'

export const dynamic = 'force-dynamic'

async function listLots(request: Request) {
  const tenant = await requireAppUserCaller(request)
  return NextResponse.json({ data: await new ListSellableLotsUseCase(new PrismaSalesRepository()).execute(tenant) })
}

export const GET = withErrorHandler(listLots)
