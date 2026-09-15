// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { PrismaClient } from '@prisma/client'
import { PrismaCropCycleRepository } from '@/infrastructure/db/farm/PrismaCropCycleRepository'
import { GetHarvestScheduleUseCase } from '@/application/farm/get-harvest-schedule-use-case'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

const prisma = new PrismaClient()
const cropCycleRepo = new PrismaCropCycleRepository(prisma)
const getHarvestScheduleUseCase = new GetHarvestScheduleUseCase(cropCycleRepo)

const getQuerySchema = z.object({
  start_date: z.string().datetime({ message: "Invalid start_date format, must be ISO string" }),
  end_date: z.string().datetime({ message: "Invalid end_date format, must be ISO string" })
})

async function getHarvestSchedule(req: Request) {
  const session = await auth()
  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const startDateStr = searchParams.get('start_date')
  const endDateStr = searchParams.get('end_date')

  if (!startDateStr || !endDateStr) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'start_date and end_date are required' } }, { status: 400 })
  }

  const validationResult = getQuerySchema.safeParse({ start_date: startDateStr, end_date: endDateStr })
  
  if (!validationResult.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: validationResult.error.errors[0].message } }, { status: 400 })
  }

  const result = await getHarvestScheduleUseCase.execute(
    validationResult.data.start_date,
    validationResult.data.end_date
  )

  return NextResponse.json({ data: result }, { status: 200 })
}

export const GET = withErrorHandler(getHarvestSchedule)
