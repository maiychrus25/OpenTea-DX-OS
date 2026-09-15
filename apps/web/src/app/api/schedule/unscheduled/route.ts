// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { PrismaClient } from '@prisma/client'
import { PrismaCropCycleRepository } from '@/infrastructure/db/farm/PrismaCropCycleRepository'
import { GetUnscheduledCyclesUseCase } from '@/application/farm/get-unscheduled-cycles-use-case'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

const prisma = new PrismaClient()
const cropCycleRepo = new PrismaCropCycleRepository(prisma)
const getUnscheduledCyclesUseCase = new GetUnscheduledCyclesUseCase(cropCycleRepo)

async function getUnscheduled() {
  const session = await auth()
  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }

  const role = session.user.role
  if (role !== 'manager') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Only Manager can view unscheduled list' } }, { status: 403 })
  }

  const data = await getUnscheduledCyclesUseCase.execute()
  return NextResponse.json({ data }, { status: 200 })
}

export const GET = withErrorHandler(getUnscheduled)
