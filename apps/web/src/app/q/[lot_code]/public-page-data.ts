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
import { hideNamesUnlessAllowed } from './public-view-local'

export interface PublicPageData {
  trace: LotTraceData
  /** Vietnam day, for the certificate status words. */
  today: string
  verification: string[]
}

/**
 * Whether the cooperative shows names on the public page.
 * TODO(integration): read htx_profiles.public_show_names (phase 2 B1 migration). Until then names stay hidden.
 */
async function showNamesFor(): Promise<boolean> {
  return false
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
    trace: hideNamesUnlessAllowed(trace, await showNamesFor()),
    today: localDay(new Date()),
    verification: await verificationLines(code),
  }
}
