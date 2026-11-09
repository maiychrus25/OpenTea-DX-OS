// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { PrismaClient } from '@prisma/client'
import { PrismaCropCycleRepository } from '@/infrastructure/db/farm/PrismaCropCycleRepository'
import { GetUnscheduledCyclesUseCase } from '@/application/farm/get-unscheduled-cycles-use-case'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

const prisma = new PrismaClient()
const cropCycleRepo = new PrismaCropCycleRepository(prisma)
const getUnscheduledCyclesUseCase = new GetUnscheduledCyclesUseCase(cropCycleRepo)

async function getUnscheduled() {
  const { role, htxProfileId } = await requireTenant()
  if (role !== 'manager') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Only Manager can view unscheduled list' } }, { status: 403 })
  }

  const data = await getUnscheduledCyclesUseCase.execute(htxProfileId)
  return NextResponse.json({ data }, { status: 200 })
}

export const GET = withErrorHandler(getUnscheduled)
