// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { requireRole } from '@/lib/api/route-helpers'
import { PrismaFreshLeafTicketRepository } from '@/infrastructure/db/weighing/PrismaFreshLeafTicketRepository'

async function mine() {
  const tenant = await requireTenant()
  requireRole(tenant, 'farmer')
  return NextResponse.json({ data: await new PrismaFreshLeafTicketRepository().mine(tenant.htxProfileId, tenant.userId) })
}

export const GET = withErrorHandler(mine)
