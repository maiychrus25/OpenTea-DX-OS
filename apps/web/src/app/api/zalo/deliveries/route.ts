// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { zaloRepository } from '@/application/zalo/zalo-services'
import { errorLabelVi } from '@/domain/zalo/zalo-events'
import { maskPhone } from '@/domain/zalo/phone'
import { requireTenant } from '@/lib/api/tenant'
import { requireRole } from '@/lib/api/route-helpers'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { zaloDeliveriesQuerySchema } from '@/lib/validations/zalo.schema'

const LIMIT = 100

/** The newest messages of the cooperative: phones masked to the last three digits, the reason of a failed or skipped one in Vietnamese. */
async function getDeliveries(request: Request) {
  const tenant = await requireTenant()
  requireRole(tenant, 'manager', 'accountant')
  const params = new URL(request.url).searchParams
  const query = zaloDeliveriesQuerySchema.parse({ status: params.get('status') || undefined, kind: params.get('kind') || undefined })
  const rows = await zaloRepository().deliveries(tenant.htxCode, { ...query, limit: LIMIT })
  return NextResponse.json({
    data: rows.map((row) => ({
      id: row.id,
      kind: row.eventKind,
      template_key: row.templateKey,
      status: row.status,
      phone_masked: maskPhone(row.phone),
      attempts: row.attempts,
      last_error: row.lastError,
      reason_vi: row.lastError ? errorLabelVi(row.lastError) : null,
      created_at: row.createdAt.toISOString(),
      sent_at: row.sentAt?.toISOString() ?? null,
    })),
  })
}

export const GET = withErrorHandler(getDeliveries)
