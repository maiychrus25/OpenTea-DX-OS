// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { jsonBody, paramOf, requireRole } from '@/lib/api/route-helpers'
import { leafTicketVoidSchema } from '@/lib/validations/weighing.schema'
import { VoidFreshLeafTicketUseCase } from '@/application/weighing/VoidFreshLeafTicketUseCase'
import { PrismaFreshLeafTicketRepository } from '@/infrastructure/db/weighing/PrismaFreshLeafTicketRepository'

async function voidTicket(request: Request, context: unknown) {
  const tenant = await requireTenant()
  requireRole(tenant, 'accountant', 'manager')
  const id = await paramOf(context)
  const { reason } = leafTicketVoidSchema.parse(await jsonBody(request))
  await new TenantGuard(tenant).leafTicket(id)
  return NextResponse.json({ data: await new VoidFreshLeafTicketUseCase(new PrismaFreshLeafTicketRepository()).execute(tenant, id, reason) })
}

export const POST = withErrorHandler(voidTicket)
