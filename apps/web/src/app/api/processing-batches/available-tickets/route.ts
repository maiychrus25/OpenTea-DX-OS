// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { requireRole } from '@/lib/api/route-helpers'
import { availableTicketsQuerySchema } from '@/lib/validations/processing.schema'
import { AvailableTickets } from '@/application/processing/BatchUseCases'
import { PrismaBatchRepository } from '@/infrastructure/db/processing/PrismaBatchRepository'

export const dynamic = 'force-dynamic'

async function availableTickets(request: Request) {
  const tenant = await requireTenant()
  requireRole(tenant, 'officer', 'manager')
  const params = new URL(request.url).searchParams
  const range = availableTicketsQuerySchema.parse({ from: params.get('from') || undefined, to: params.get('to') || undefined })
  return NextResponse.json({ data: await new AvailableTickets(new PrismaBatchRepository()).execute(tenant, range) })
}

export const GET = withErrorHandler(availableTickets)
