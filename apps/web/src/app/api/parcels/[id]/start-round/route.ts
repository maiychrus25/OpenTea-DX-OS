// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { requireTenant } from '@/lib/api/tenant'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { prisma } from '@/infrastructure/db/prisma.client'
import { PrismaCropCycleRepository } from '@/infrastructure/db/farm/PrismaCropCycleRepository'
import { StartHarvestRoundUseCase } from '@/application/farm/start-harvest-round.usecase'
import { ForbiddenError } from '@/domain/errors'

async function postStartRound(_request: Request, context: { params: Promise<{ id: string }> }) {
  const tenant = await requireTenant()
  if (tenant.role !== 'officer') throw new ForbiddenError('Chỉ cán bộ kỹ thuật được bắt đầu lứa mới')

  const { id } = await context.params
  await new TenantGuard(tenant).parcel(id)

  const data = await new StartHarvestRoundUseCase(new PrismaCropCycleRepository(prisma)).execute(id, tenant.userId)
  return NextResponse.json({ data })
}

export const POST = withErrorHandler(postStartRound)
