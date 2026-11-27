// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { jsonBody } from '@/lib/api/route-helpers'
import { settlementCreateSchema } from '@/lib/validations/ledger.schema'
import { CreateSettlementPeriodUseCase, ListSettlementsUseCase } from '@/application/ledger/SettlementUseCases'
import { PrismaSettlementRepository } from '@/infrastructure/db/ledger/PrismaSettlementRepository'

async function createPeriod(request: Request) {
  const tenant = await requireTenant()
  const body = settlementCreateSchema.parse(await jsonBody(request))
  return NextResponse.json({ data: await new CreateSettlementPeriodUseCase(new PrismaSettlementRepository()).execute(tenant, body) }, { status: 201 })
}

async function listPeriods() {
  const tenant = await requireTenant()
  return NextResponse.json({ data: await new ListSettlementsUseCase(new PrismaSettlementRepository()).execute(tenant) })
}

export const POST = withErrorHandler(createPeriod)
export const GET = withErrorHandler(listPeriods)
