// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { paramOf } from '@/lib/api/route-helpers'
import { GetSettlementSlipUseCase } from '@/application/ledger/SettlementUseCases'
import { PrismaSettlementRepository } from '@/infrastructure/db/ledger/PrismaSettlementRepository'

async function getSlip(_request: Request, context: unknown) {
  const tenant = await requireTenant()
  const slip = await new GetSettlementSlipUseCase(new PrismaSettlementRepository()).execute(tenant, await paramOf(context), await paramOf(context, 'lineId'))
  return NextResponse.json({ data: slip })
}

export const GET = withErrorHandler(getSlip)
