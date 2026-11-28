// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { paramOf, requireRole } from '@/lib/api/route-helpers'
import { RemoveTicket } from '@/application/processing/BatchUseCases'
import { PrismaBatchRepository } from '@/infrastructure/db/processing/PrismaBatchRepository'

async function removeTicket(_request: Request, context: unknown) {
  const tenant = await requireTenant()
  requireRole(tenant, 'officer', 'manager')
  const id = await paramOf(context)
  const ticketId = await paramOf(context, 'ticketId')
  await new TenantGuard(tenant).processingBatch(id)
  return NextResponse.json({ data: await new RemoveTicket(new PrismaBatchRepository()).execute(tenant, id, ticketId) })
}

export const DELETE = withErrorHandler(removeTicket)
