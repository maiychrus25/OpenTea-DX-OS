// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { requireRole } from '@/lib/api/route-helpers'
import { PrismaFreshLeafTicketRepository } from '@/infrastructure/db/weighing/PrismaFreshLeafTicketRepository'

// The weighing station finds a household by name or phone; the farm routes stay for officers and managers.
async function searchHouseholds(request: Request) {
  const tenant = await requireTenant()
  requireRole(tenant, 'accountant', 'manager', 'officer')
  const q = (new URL(request.url).searchParams.get('q') ?? '').slice(0, 60)
  return NextResponse.json({ data: await new PrismaFreshLeafTicketRepository().searchHouseholds(tenant.htxProfileId, q) })
}

export const GET = withErrorHandler(searchHouseholds)
