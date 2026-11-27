// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { paramOf, requireRole } from '@/lib/api/route-helpers'
import { PrismaFreshLeafTicketRepository } from '@/infrastructure/db/weighing/PrismaFreshLeafTicketRepository'

async function summary(_request: Request, context: unknown) {
  const tenant = await requireTenant()
  requireRole(tenant, 'manager', 'officer')
  const id = await paramOf(context)
  await new TenantGuard(tenant).cropCycle(id)
  return NextResponse.json({ data: await new PrismaFreshLeafTicketRepository().weighingSummary(tenant.htxProfileId, id) })
}

export const GET = withErrorHandler(summary)
