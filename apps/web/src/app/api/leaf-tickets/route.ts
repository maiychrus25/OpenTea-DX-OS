// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { jsonBody, requireRole } from '@/lib/api/route-helpers'
import { leafTicketCreateSchema, leafTicketListQuerySchema } from '@/lib/validations/weighing.schema'
import { CreateFreshLeafTicketUseCase } from '@/application/weighing/CreateFreshLeafTicketUseCase'
import { PrismaFreshLeafTicketRepository } from '@/infrastructure/db/weighing/PrismaFreshLeafTicketRepository'

async function createTicket(request: Request) {
  const tenant = await requireTenant()
  requireRole(tenant, 'accountant', 'manager')
  const body = leafTicketCreateSchema.parse(await jsonBody(request))
  const guard = new TenantGuard(tenant)
  await guard.household(body.household_id)
  await guard.parcel(body.parcel_id)
  await guard.leafGrade(body.grade_id)
  const { ticket, created } = await new CreateFreshLeafTicketUseCase(new PrismaFreshLeafTicketRepository()).execute(tenant, body)
  // A replay of an offline submission returns the first ticket instead of making a second.
  return NextResponse.json({ data: ticket }, { status: created ? 201 : 200 })
}

async function listTickets(request: Request) {
  const tenant = await requireTenant()
  requireRole(tenant, 'manager', 'accountant', 'officer')
  const params = new URL(request.url).searchParams
  const query = leafTicketListQuerySchema.parse({
    date: params.get('date') || undefined,
    household_id: params.get('household_id') || undefined,
    status: params.get('status') || undefined,
    cursor: params.get('cursor') || undefined,
  })
  const result = await new PrismaFreshLeafTicketRepository().list({
    htxProfileId: tenant.htxProfileId,
    day: query.date,
    householdId: query.household_id,
    status: query.status,
    cursor: query.cursor,
  })
  return NextResponse.json(result)
}

export const POST = withErrorHandler(createTicket)
export const GET = withErrorHandler(listTickets)
