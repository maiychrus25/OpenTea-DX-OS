// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { paramOf, requireRole } from '@/lib/api/route-helpers'
import { withdrawalStatusQuerySchema } from '@/lib/validations/weighing.schema'
import { vnDayOf } from '@/application/agent/campaign/vn-day'
import { endOfVnDay, weighingBlock } from '@/application/weighing/withdrawal-gate'
import { PrismaFreshLeafTicketRepository } from '@/infrastructure/db/weighing/PrismaFreshLeafTicketRepository'

// The light of the weighing screen. The ticket itself is checked again on the server inside its transaction.
async function getStatus(request: Request, context: unknown) {
  const tenant = await requireTenant()
  requireRole(tenant, 'accountant', 'manager', 'officer')
  const id = await paramOf(context)
  await new TenantGuard(tenant).parcel(id)
  const { at } = withdrawalStatusQuerySchema.parse({ at: new URL(request.url).searchParams.get('at') ?? undefined })
  const day = at ?? vnDayOf(new Date())
  const safeFrom = weighingBlock(await new PrismaFreshLeafTicketRepository().sprayEntries(id, endOfVnDay(day)), day)
  return NextResponse.json({ data: { blocked: safeFrom !== null, safe_from: safeFrom } })
}

export const GET = withErrorHandler(getStatus)
