// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { jsonBody } from '@/lib/api/route-helpers'
import { leafPricesPutSchema } from '@/lib/validations/weighing.schema'
import { vnDayOf } from '@/application/agent/campaign/vn-day'
import { zaloNotifier } from '@/application/zalo/zalo-services'
import { PublishDailyPricesUseCase } from '@/application/weighing/PublishDailyPricesUseCase'
import { PrismaLeafPriceRepository } from '@/infrastructure/db/weighing/PrismaLeafPriceRepository'

async function getToday() {
  const tenant = await requireTenant()
  return NextResponse.json({ data: await new PrismaLeafPriceRepository().pricesFor(tenant.htxProfileId, vnDayOf(new Date())) })
}

async function putToday(request: Request) {
  const tenant = await requireTenant()
  const body = leafPricesPutSchema.parse(await jsonBody(request))
  const data = await new PublishDailyPricesUseCase(new PrismaLeafPriceRepository(), undefined, zaloNotifier()).execute(tenant, body.prices)
  return NextResponse.json({ data })
}

export const GET = withErrorHandler(getToday)
export const PUT = withErrorHandler(putToday)
