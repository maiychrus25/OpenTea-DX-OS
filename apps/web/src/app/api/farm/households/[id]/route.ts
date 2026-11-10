// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { requireTenant } from '@/lib/api/tenant'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { PrismaHouseholdRepository } from '@/infrastructure/db/farm/PrismaHouseholdRepository'
import { CoreGatewayClient } from '@/infrastructure/core/core-gateway.client'
import { GatewayHouseholdReader } from '@/infrastructure/core/gateway-household-reader'
import { GetHouseholdUseCase } from '@/application/farm/GetHouseholdUseCase'
import { UpdateHouseholdUseCase } from '@/application/farm/UpdateHouseholdUseCase'
import { householdUpdateSchema } from '@/lib/validations/household.schema'

async function getHousehold(_request: Request, context: unknown) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }
  const role = (session.user as any).role
  const userHouseholdId = role === 'farmer' ? (session.user as any).household_id : undefined

  const { params } = context as { params: Promise<{ id: string }> }
  const { id } = await params

  const useCase = new GetHouseholdUseCase(new GatewayHouseholdReader(new CoreGatewayClient(role)))
  
  const data = await useCase.execute(id, role.toUpperCase(), userHouseholdId)
  
  return NextResponse.json({ data })
}

async function updateHousehold(request: Request, context: unknown) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }
  const role = (session.user as any).role
  const userHouseholdId = role === 'farmer' ? (session.user as any).household_id : undefined

  const { params } = context as { params: Promise<{ id: string }> }
  const { id } = await params
  await new TenantGuard(await requireTenant()).household(id)

  const body = await request.json().catch(() => ({}))
  const parse = householdUpdateSchema.safeParse(body)
  if (!parse.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: parse.error.message } }, { status: 400 })
  }

  const repo = new PrismaHouseholdRepository()
  const useCase = new UpdateHouseholdUseCase(repo)
  
  const data = await useCase.execute(id, parse.data, role.toUpperCase(), userHouseholdId)
  
  return NextResponse.json({ data })
}

export const GET = withErrorHandler(getHousehold)
export const PUT = withErrorHandler(updateHousehold)
