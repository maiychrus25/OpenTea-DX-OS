// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { jsonBody, paramOf, requireRole } from '@/lib/api/route-helpers'
import { householdBankSchema } from '@/lib/validations/ledger.schema'
import { SetHouseholdBankUseCase } from '@/application/ledger/SetHouseholdBankUseCase'
import { PrismaLedgerRepository } from '@/infrastructure/db/ledger/PrismaLedgerRepository'

// The body holds a bank account number: it is parsed and stored, never logged.
async function setBank(request: Request, context: unknown) {
  const tenant = await requireTenant()
  requireRole(tenant, 'manager', 'accountant')
  const id = await paramOf(context)
  const body = householdBankSchema.parse(await jsonBody(request))
  await new TenantGuard(tenant).household(id)
  return NextResponse.json({ data: await new SetHouseholdBankUseCase(new PrismaLedgerRepository()).execute(tenant, id, body) })
}

async function getBank(_request: Request, context: unknown) {
  const tenant = await requireTenant()
  requireRole(tenant, 'manager', 'accountant')
  const id = await paramOf(context)
  await new TenantGuard(tenant).household(id)
  return NextResponse.json({ data: await new SetHouseholdBankUseCase(new PrismaLedgerRepository()).get(tenant, id) })
}

export const GET = withErrorHandler(getBank)
export const PUT = withErrorHandler(setBank)
