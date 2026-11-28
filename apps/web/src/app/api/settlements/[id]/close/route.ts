// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { jsonBody, paramOf } from '@/lib/api/route-helpers'
import { settlementCloseSchema } from '@/lib/validations/ledger.schema'
import { zaloNotifier } from '@/application/zalo/zalo-services'
import { CloseSettlementPeriodUseCase } from '@/application/ledger/SettlementUseCases'
import { PrismaSettlementRepository } from '@/infrastructure/db/ledger/PrismaSettlementRepository'

// Only this route closes a period: no agent tool, no schedule and no other route calls the use case.
async function closePeriod(request: Request, context: unknown) {
  const tenant = await requireTenant()
  const body = settlementCloseSchema.parse(await jsonBody(request))
  const data = await new CloseSettlementPeriodUseCase(new PrismaSettlementRepository(), undefined, zaloNotifier()).execute(tenant, await paramOf(context), {
    household_count: body.expected_household_count,
    payable_total_vnd: body.expected_payable_total_vnd,
  })
  return NextResponse.json({ data })
}

export const POST = withErrorHandler(closePeriod)
