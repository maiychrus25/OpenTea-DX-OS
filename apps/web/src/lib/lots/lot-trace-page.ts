// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { GetLotTraceDataUseCase } from '@/application/useCases/get-lot-trace-data-usecase'
import { NotFoundError } from '@/domain/errors'
import type { LotTraceData } from '@/domain/entities/lot-trace-data'
import { PrismaLotTraceRepository } from '@/infrastructure/db/repositories/prisma-lot-trace-repository'

/** The lot's trace data for the server pages of the office; null when the lot does not exist. */
export async function loadLotTraceOrNull(lotCode: string): Promise<LotTraceData | null> {
  try {
    return await new GetLotTraceDataUseCase(new PrismaLotTraceRepository()).execute(lotCode)
  } catch (error) {
    if (error instanceof NotFoundError) return null
    throw error
  }
}
