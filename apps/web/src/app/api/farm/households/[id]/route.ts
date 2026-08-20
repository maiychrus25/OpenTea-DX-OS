// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { PrismaHouseholdRepository } from '@/infrastructure/db/farm/PrismaHouseholdRepository'
import { GetHouseholdUseCase } from '@/application/farm/GetHouseholdUseCase'
import { UpdateHouseholdUseCase } from '@/application/farm/UpdateHouseholdUseCase'
import { householdUpdateSchema } from '@/lib/validations/household.schema'

async function getHousehold(request: Request, props: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }
  const role = (session.user as any).role
  const userHouseholdId = role === 'farmer' ? (session.user as any).household_id : undefined

  const { id } = await props.params

  const repo = new PrismaHouseholdRepository()
  const useCase = new GetHouseholdUseCase(repo)
  
  const data = await useCase.execute(id, role.toUpperCase(), userHouseholdId)
  
  return NextResponse.json({ data })
}

async function updateHousehold(request: Request, props: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }
  const role = (session.user as any).role
  const userHouseholdId = role === 'farmer' ? (session.user as any).household_id : undefined

  const { id } = await props.params

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
