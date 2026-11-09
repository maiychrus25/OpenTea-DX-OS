// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { householdCreateSchema } from '@/lib/validations/household.schema'
import { PrismaHouseholdRepository } from '@/infrastructure/db/farm/PrismaHouseholdRepository'
import { ListHouseholdsUseCase } from '@/application/farm/ListHouseholdsUseCase'
import { CreateHouseholdUseCase } from '@/application/farm/CreateHouseholdUseCase'

async function getHouseholds() {
  const { role, htxProfileId } = await requireTenant()
  if (role !== 'officer' && role !== 'manager') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 })
  }

  const repo = new PrismaHouseholdRepository()
  const useCase = new ListHouseholdsUseCase(repo)
  const data = await useCase.execute(htxProfileId)
  return NextResponse.json({ data })
}

async function postHousehold(request: Request) {
  const { role, htxProfileId } = await requireTenant()
  if (role !== 'officer') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Only officer can create households' } }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const parse = householdCreateSchema.safeParse(body)
  if (!parse.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: parse.error.message } }, { status: 400 })
  }

  const repo = new PrismaHouseholdRepository()
  const useCase = new CreateHouseholdUseCase(repo)
  const data = await useCase.execute({
    ...parse.data,
    htx_profile_id: htxProfileId,
  })
  return NextResponse.json({ data }, { status: 201 })
}

export const GET = withErrorHandler(getHouseholds)
export const POST = withErrorHandler(postHousehold)
