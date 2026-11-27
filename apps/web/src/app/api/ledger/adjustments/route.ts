// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { jsonBody, requireRole } from '@/lib/api/route-helpers'
import { adjustmentSchema } from '@/lib/validations/ledger.schema'
import { CreateLedgerAdjustmentUseCase } from '@/application/ledger/SettlementUseCases'
import { PrismaSettlementRepository } from '@/infrastructure/db/ledger/PrismaSettlementRepository'

async function createAdjustment(request: Request) {
  const tenant = await requireTenant()
  requireRole(tenant, 'manager')
  const body = adjustmentSchema.parse(await jsonBody(request))
  await new TenantGuard(tenant).household(body.household_id)
  return NextResponse.json({ data: await new CreateLedgerAdjustmentUseCase(new PrismaSettlementRepository()).execute(tenant, body) }, { status: 201 })
}

export const POST = withErrorHandler(createAdjustment)
