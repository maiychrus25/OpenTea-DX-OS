// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { requireRole } from '@/lib/api/route-helpers'
import { reportCsvQuerySchema } from '@/lib/validations/report.schema'
import { SeasonReportUseCase } from '@/application/report/SeasonReportUseCase'
import { reportSectionCsv } from '@/application/report/reportCsv'
import { PrismaReportSource } from '@/infrastructure/db/report/PrismaReportSource'

export const dynamic = 'force-dynamic'

async function exportCsv(request: Request) {
  const tenant = await requireTenant()
  requireRole(tenant, 'manager', 'accountant')
  const params = new URL(request.url).searchParams
  const { from, to, section } = reportCsvQuerySchema.parse({ from: params.get('from') ?? undefined, to: params.get('to') ?? undefined, section: params.get('section') ?? undefined })
  const report = await new SeasonReportUseCase(new PrismaReportSource()).read(tenant.htxProfileId, from, to)
  const csv = reportSectionCsv(report, section)
  if (csv === null) return NextResponse.json({ error: { code: 'SECTION_UNAVAILABLE', message: 'Phần này chưa có dữ liệu để xuất' } }, { status: 503 })
  return new NextResponse(`\uFEFF${csv}`, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="bao-cao-${section}-${from}_${to}.csv"` },
  })
}

export const GET = withErrorHandler(exportCsv)
