// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { jsonBody, paramOf, requireRole } from '@/lib/api/route-helpers'
import { advanceVoidSchema } from '@/lib/validations/ledger.schema'
import { VoidInputAdvanceUseCase } from '@/application/ledger/VoidInputAdvanceUseCase'
import { PrismaInputRepository } from '@/infrastructure/db/ledger/PrismaInputRepository'

async function voidAdvance(request: Request, context: unknown) {
  const tenant = await requireTenant()
  requireRole(tenant, 'accountant', 'manager')
  const id = await paramOf(context)
  const { reason } = advanceVoidSchema.parse(await jsonBody(request))
  await new TenantGuard(tenant).inputAdvance(id)
  return NextResponse.json({ data: await new VoidInputAdvanceUseCase(new PrismaInputRepository()).execute(tenant, id, reason) })
}

export const POST = withErrorHandler(voidAdvance)
