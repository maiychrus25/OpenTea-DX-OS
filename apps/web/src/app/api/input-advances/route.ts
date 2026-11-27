// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { jsonBody, requireRole } from '@/lib/api/route-helpers'
import { advanceCreateSchema, advanceListQuerySchema } from '@/lib/validations/ledger.schema'
import { CreateInputAdvanceUseCase } from '@/application/ledger/CreateInputAdvanceUseCase'
import { PrismaInputRepository } from '@/infrastructure/db/ledger/PrismaInputRepository'

async function createAdvance(request: Request) {
  const tenant = await requireTenant()
  requireRole(tenant, 'accountant', 'manager')
  const body = advanceCreateSchema.parse(await jsonBody(request))
  await new TenantGuard(tenant).household(body.household_id)
  const { advance, created } = await new CreateInputAdvanceUseCase(new PrismaInputRepository()).execute(tenant, body)
  // A replay of an offline submission returns the first advance instead of making a second.
  return NextResponse.json({ data: advance }, { status: created ? 201 : 200 })
}

async function listAdvances(request: Request) {
  const tenant = await requireTenant()
  requireRole(tenant, 'manager', 'accountant', 'officer')
  const params = new URL(request.url).searchParams
  const query = advanceListQuerySchema.parse({
    household_id: params.get('household_id') || undefined,
    from: params.get('from') || undefined,
    to: params.get('to') || undefined,
    status: params.get('status') || undefined,
    cursor: params.get('cursor') || undefined,
  })
  return NextResponse.json(await new PrismaInputRepository().listAdvances({
    htxProfileId: tenant.htxProfileId,
    householdId: query.household_id,
    from: query.from,
    to: query.to,
    status: query.status,
    cursor: query.cursor,
  }))
}

export const POST = withErrorHandler(createAdvance)
export const GET = withErrorHandler(listAdvances)
