// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { paramOf } from '@/lib/api/route-helpers'
import { GetSettlementUseCase } from '@/application/ledger/SettlementUseCases'
import { PrismaSettlementRepository } from '@/infrastructure/db/ledger/PrismaSettlementRepository'

async function getPeriod(_request: Request, context: unknown) {
  const tenant = await requireTenant()
  return NextResponse.json({ data: await new GetSettlementUseCase(new PrismaSettlementRepository()).execute(tenant, await paramOf(context)) })
}

export const GET = withErrorHandler(getPeriod)
