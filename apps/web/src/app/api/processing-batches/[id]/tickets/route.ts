// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { jsonBody, paramOf, requireRole } from '@/lib/api/route-helpers'
import { batchTicketsSchema } from '@/lib/validations/processing.schema'
import { AddTickets } from '@/application/processing/BatchUseCases'
import { PrismaBatchRepository } from '@/infrastructure/db/processing/PrismaBatchRepository'

async function handle(request: Request, context: unknown) {
  const tenant = await requireTenant()
  requireRole(tenant, 'officer', 'manager')
  const id = await paramOf(context)
  const body = batchTicketsSchema.parse(await jsonBody(request))
  await new TenantGuard(tenant).processingBatch(id)
  return NextResponse.json({ data: await new AddTickets(new PrismaBatchRepository()).execute(tenant, id, body.ticket_ids) })
}

export const POST = withErrorHandler(handle)
