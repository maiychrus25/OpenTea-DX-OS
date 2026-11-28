// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { paramOf, requireRole } from '@/lib/api/route-helpers'
import { NotFoundError } from '@/domain/errors'
import { PrismaFreshLeafTicketRepository } from '@/infrastructure/db/weighing/PrismaFreshLeafTicketRepository'

async function getTicket(_request: Request, context: unknown) {
  const tenant = await requireTenant()
  requireRole(tenant, 'manager', 'accountant', 'officer', 'farmer')
  const found = await new PrismaFreshLeafTicketRepository().get(tenant.htxProfileId, await paramOf(context))
  // A farmer sees tickets of their own household only; any other one looks missing.
  if (!found || (tenant.role === 'farmer' && found.household_keycloak_user_id !== tenant.userId)) throw new NotFoundError('Không tìm thấy phiếu cân')
  const { household_keycloak_user_id: _owner, ...ticket } = found
  return NextResponse.json({ data: ticket })
}

export const GET = withErrorHandler(getTicket)
