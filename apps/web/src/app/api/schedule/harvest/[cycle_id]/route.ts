// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { PrismaClient } from '@prisma/client'
import { PrismaCropCycleRepository } from '@/infrastructure/db/farm/PrismaCropCycleRepository'
import { UpdateHarvestDateUseCase } from '@/application/farm/update-harvest-date-use-case'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

const prisma = new PrismaClient()
const cropCycleRepo = new PrismaCropCycleRepository(prisma)
const updateHarvestDateUseCase = new UpdateHarvestDateUseCase(cropCycleRepo)

const patchBodySchema = z.object({
  estimated_harvest_date: z.string().datetime({ message: "Invalid date format, must be ISO string" })
})

async function patchHarvestDate(req: Request, context: { params: { cycle_id: string } }) {
  const session = await auth()
  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }

  // Ensure only MANAGER role can update the schedule
  const role = session.user.role
  if (role !== 'manager') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Only Manager can update harvest schedule' } }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const validationResult = patchBodySchema.safeParse(body)
  
  if (!validationResult.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: validationResult.error.errors[0].message } }, { status: 400 })
  }

  await updateHarvestDateUseCase.execute(context.params.cycle_id, validationResult.data.estimated_harvest_date)

  return NextResponse.json({ data: { success: true } }, { status: 200 })
}

export const PATCH = withErrorHandler(patchHarvestDate)
