// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { requireRole } from '@/lib/api/route-helpers'
import { leafTicketExportQuerySchema } from '@/lib/validations/weighing.schema'
import { PrismaInputRepository } from '@/infrastructure/db/ledger/PrismaInputRepository'
import { toCsv } from '@/infrastructure/db/weighing/csv'

const MAX_ROWS = 20000

async function exportCsv(request: Request) {
  const tenant = await requireTenant()
  requireRole(tenant, 'manager', 'accountant')
  const params = new URL(request.url).searchParams
  const { from, to } = leafTicketExportQuerySchema.parse({ from: params.get('from') ?? undefined, to: params.get('to') ?? undefined })
  const advances = await new PrismaInputRepository().listAdvancesRange(tenant.htxProfileId, from, to, MAX_ROWS)
  const csv = toCsv(
    ['Số phiếu', 'Ngày ứng', 'Hộ', 'Vật tư', 'Đơn vị', 'Số lượng', 'Đơn giá (đ)', 'Thành tiền (đ)', 'Trạng thái', 'Lý do huỷ'],
    advances.map((a) => [a.advance_no, a.advanced_on, a.household_name, a.item_name, a.unit, String(a.quantity), String(a.unit_price_vnd), a.amount_vnd, a.status === 'VALID' ? 'Hợp lệ' : 'Đã huỷ', a.void_reason ?? '']),
  )
  return new NextResponse(`﻿${csv}`, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="phieu-ung-${from}_${to}.csv"` },
  })
}

export const GET = withErrorHandler(exportCsv)
