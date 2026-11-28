// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { unstable_cache } from 'next/cache'
import { GetLotTraceDataUseCase } from '@/application/useCases/get-lot-trace-data-usecase'
import { LotAiVerification } from '@/application/lot/lot-ai-verification'
import type { LotTraceData } from '@/domain/entities/lot-trace-data'
import { NotFoundError } from '@/domain/errors'
import { localDay } from '@/domain/shared/local-day'
import { logger } from '@/lib/logger'
import { PrismaLotTraceRepository } from '@/infrastructure/db/repositories/prisma-lot-trace-repository'
import { PrismaLotVerificationRepository } from '@/infrastructure/db/repositories/prisma-lot-verification-repository'
import { publicView } from '@/domain/lot/public-view'
import { prisma } from '@/infrastructure/db/prisma.client'

export interface PublicPageData {
  trace: LotTraceData
  /** Vietnam day, for the certificate status words. */
  today: string
  verification: string[]
}

/** Whether the lot's cooperative shows names on the public page. Unknown means hidden. */
async function showNamesFor(code: string): Promise<boolean> {
  const lot = await prisma.lot.findUnique({ where: { lot_code: code }, select: { htx_profile: { select: { public_show_names: true } } } })
  return lot?.htx_profile?.public_show_names ?? false
}

/** The audit verification line never fails the page: a lookup error shows no line and is logged. Cached 5 minutes, as on /lot. */
const verificationLines = unstable_cache(
  async (code: string): Promise<string[]> => {
    try {
      return await new LotAiVerification(new PrismaLotVerificationRepository()).execute(code)
    } catch (err) {
      logger.error('Lot verification line failed', { lot_code: code, err })
      return []
    }
  },
  ['lot-ai-verification-public'],
  { revalidate: 300 },
)

/** The one data step of the public QR page; null when the lot does not exist. */
export async function loadPublicPageData(code: string): Promise<PublicPageData | null> {
  let trace: LotTraceData
  try {
    trace = await new GetLotTraceDataUseCase(new PrismaLotTraceRepository()).execute(code)
  } catch (e) {
    if (e instanceof NotFoundError) return null
    throw e
  }
  return {
    trace: publicView(trace, await showNamesFor(code)),
    today: localDay(new Date()),
    verification: await verificationLines(code),
  }
}
