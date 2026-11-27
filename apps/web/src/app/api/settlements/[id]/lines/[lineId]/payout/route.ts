// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { jsonBody, paramOf } from '@/lib/api/route-helpers'
import { payoutSchema } from '@/lib/validations/ledger.schema'
import { RecordPayoutUseCase } from '@/application/ledger/SettlementUseCases'
import { PrismaSettlementRepository } from '@/infrastructure/db/ledger/PrismaSettlementRepository'

async function recordPayout(request: Request, context: unknown) {
  const tenant = await requireTenant()
  const body = payoutSchema.parse(await jsonBody(request))
  const line = await new RecordPayoutUseCase(new PrismaSettlementRepository()).execute(tenant, await paramOf(context), await paramOf(context, 'lineId'), body)
  return NextResponse.json({ data: line })
}

export const POST = withErrorHandler(recordPayout)
