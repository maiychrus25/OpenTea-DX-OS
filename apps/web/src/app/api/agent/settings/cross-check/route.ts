// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { CrossCheckSettingsUseCase, crossCheckThresholdsSchema } from '@/application/agent/cross-check-settings'
import { ForbiddenError } from '@/domain/errors'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

/** Managers and officers read the cross-check thresholds; only the manager changes them. */
async function getCrossCheckSettings() {
  const tenant = await requireTenant()
  if (tenant.role !== 'manager' && tenant.role !== 'officer') throw new ForbiddenError('Forbidden')
  const thresholds = await new CrossCheckSettingsUseCase().read(tenant.htxCode)
  return NextResponse.json({ data: { thresholds, can_edit: tenant.role === 'manager' } })
}

async function putCrossCheckSettings(request: Request) {
  const tenant = await requireTenant()
  if (tenant.role !== 'manager') throw new ForbiddenError('Forbidden')
  const change = crossCheckThresholdsSchema.parse(await request.json().catch(() => null))
  const thresholds = await new CrossCheckSettingsUseCase().save(tenant.htxCode, `user:${tenant.userId}`, change)
  return NextResponse.json({ data: { thresholds, can_edit: true } })
}

export const GET = withErrorHandler(getCrossCheckSettings)
export const PUT = withErrorHandler(putCrossCheckSettings)
