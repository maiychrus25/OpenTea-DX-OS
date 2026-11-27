// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { requireRole } from '@/lib/api/route-helpers'
import { leafTicketExportQuerySchema } from '@/lib/validations/weighing.schema'
import { PrismaFreshLeafTicketRepository } from '@/infrastructure/db/weighing/PrismaFreshLeafTicketRepository'
import { toCsv } from '@/infrastructure/db/weighing/csv'

const MAX_ROWS = 20000
const localTime = (iso: string) => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' })

async function exportCsv(request: Request) {
  const tenant = await requireTenant()
  requireRole(tenant, 'manager', 'accountant')
  const params = new URL(request.url).searchParams
  const { from, to } = leafTicketExportQuerySchema.parse({ from: params.get('from') ?? undefined, to: params.get('to') ?? undefined })
  const tickets = await new PrismaFreshLeafTicketRepository().listRange(tenant.htxProfileId, from, to, MAX_ROWS)
  const csv = toCsv(
    ['Số phiếu', 'Giờ cân', 'Hộ', 'Nương', 'Phẩm cấp', 'Kg cân', '% trừ', 'Kg tịnh', 'Giá (đ/kg)', 'Thành tiền (đ)', 'Trạng thái', 'Lý do huỷ'],
    tickets.map((t) => [t.ticket_no, localTime(t.weighed_at), t.household_name, t.parcel_code, t.grade_name, String(t.gross_kg), String(t.deduction_pct), String(t.net_kg), String(t.price_vnd_per_kg), t.amount_vnd, t.status === 'VALID' ? 'Hợp lệ' : 'Đã huỷ', t.void_reason ?? '']),
  )
  return new NextResponse(`﻿${csv}`, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="phieu-can-${from}_${to}.csv"` },
  })
}

export const GET = withErrorHandler(exportCsv)
