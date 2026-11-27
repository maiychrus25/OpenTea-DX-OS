// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { autopilotService } from '@/application/telegram/telegram-services'
import { ForbiddenError } from '@/domain/errors'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { labsOnly } from '@/lib/labs'

/** Dừng ngay: a manager or an officer stops the mode. Pending windows go back to normal approval. */
async function postStopAutopilot() {
  const tenant = await requireTenant()
  if (tenant.role !== 'manager' && tenant.role !== 'officer') throw new ForbiddenError('Forbidden')
  const stopped = await autopilotService().stop(tenant.htxCode, tenant.userId)
  const view = await autopilotService().view(tenant.htxCode)
  return NextResponse.json({ data: { ...view, returned: stopped?.returned ?? 0, was_on: stopped !== null } })
}

export const POST = withErrorHandler(labsOnly(postStopAutopilot))

// DXOS_LABS is read per request; a prerendered answer would freeze the switch into the build.
export const dynamic = 'force-dynamic'
