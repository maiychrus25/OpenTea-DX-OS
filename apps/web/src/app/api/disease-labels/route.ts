// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { requireRole } from '@/lib/api/route-helpers'
import { PrismaDiseaseLabelRepository } from '@/infrastructure/db/farm/PrismaDiseaseLabelRepository'

export const dynamic = 'force-dynamic'

/** The list an officer picks the confirmed label from: targets first, then by sort_order. */
async function listLabels() {
  const tenant = await requireTenant()
  requireRole(tenant, 'manager', 'officer')
  return NextResponse.json({ data: await new PrismaDiseaseLabelRepository().list() })
}

export const GET = withErrorHandler(listLabels)
