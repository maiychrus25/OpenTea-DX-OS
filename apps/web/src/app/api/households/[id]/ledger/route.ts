// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { paramOf, requireRole } from '@/lib/api/route-helpers'
import { ReadLedgerUseCase } from '@/application/ledger/ReadLedgerUseCase'
import { PrismaLedgerRepository } from '@/infrastructure/db/ledger/PrismaLedgerRepository'

async function householdLedger(_request: Request, context: unknown) {
  const tenant = await requireTenant()
  requireRole(tenant, 'manager', 'accountant')
  const id = await paramOf(context)
  await new TenantGuard(tenant).household(id)
  return NextResponse.json({ data: await new ReadLedgerUseCase(new PrismaLedgerRepository()).forHousehold(tenant, id) })
}

export const GET = withErrorHandler(householdLedger)
