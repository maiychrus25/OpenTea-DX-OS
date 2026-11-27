// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { touchManagerActivity } from '@/application/agent/autopilot/manager-activity'
import { autopilotService } from '@/application/telegram/telegram-services'
import { ForbiddenError } from '@/domain/errors'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { labsOnly } from '@/lib/labs'

/** Status, the kinds with their match rates and today's counts. Managers and officers read it. */
async function getAutopilot() {
  const tenant = await requireTenant()
  if (tenant.role !== 'manager' && tenant.role !== 'officer') throw new ForbiddenError('Forbidden')
  await touchManagerActivity(tenant.htxCode, tenant.role)
  const view = await autopilotService().view(tenant.htxCode)
  return NextResponse.json({ data: { ...view, can_enable: tenant.role === 'manager' } })
}

export const GET = withErrorHandler(labsOnly(getAutopilot))
