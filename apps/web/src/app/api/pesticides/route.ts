// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { ForbiddenError } from '@/domain/errors'
import { PrismaPesticideRepository } from '@/infrastructure/db/pesticide/PrismaPesticideRepository'
import { GetFarmerHouseholdUseCase } from '@/application/farm/GetFarmerHouseholdUseCase'
import { PrismaHouseholdRepository } from '@/infrastructure/db/farm/PrismaHouseholdRepository'

const querySchema = z.object({ q: z.string().trim().max(100).optional(), target: z.string().trim().max(100).optional() })

async function listPesticides(request: Request) {
  const tenant = await requireTenant()
  if (!['farmer', 'officer', 'manager'].includes(tenant.role)) throw new ForbiddenError('Forbidden')

  const url = new URL(request.url)
  const { q, target } = querySchema.parse({ q: url.searchParams.get('q') || undefined, target: url.searchParams.get('target') || undefined })
  // A farmer sees the products the household used recently first.
  const household = tenant.role === 'farmer' ? await new GetFarmerHouseholdUseCase(new PrismaHouseholdRepository()).execute(tenant.userId) : null
  const data = await new PrismaPesticideRepository().list(tenant.htxProfileId, { q, target, householdId: household?.id })
  return NextResponse.json({ data })
}

export const GET = withErrorHandler(listPesticides)
