// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { CampaignClosedError } from '@/application/agent/campaign/campaign-errors'
import { campaignServices } from '@/application/telegram/telegram-services'
import { touchManagerActivity } from '@/application/agent/autopilot/manager-activity'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

const campaignIdSchema = z.string().uuid()
const decisionBodySchema = z.object({ decision: z.enum(['approve_all', 'drop']) })

/** Approve all or drop the day's campaign from the inbox (contract C8). Answers the approve-all counts. */
async function postCampaignDecision(request: Request, context: unknown) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }
  const tenant = await requireTenant()
  if (tenant.role !== 'manager' && tenant.role !== 'officer') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 })
  }

  await touchManagerActivity(tenant.htxCode, tenant.role)

  const { params } = context as { params: Promise<{ id: string }> | { id: string } }
  const { id } = await params
  if (!campaignIdSchema.safeParse(id).success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Mã chiến dịch không hợp lệ' } }, { status: 400 })
  }
  const parsed = decisionBodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, { status: 400 })
  }

  const userName = session.user.name || session.user.email || tenant.userId
  const services = campaignServices()
  try {
    if (parsed.data.decision === 'drop') {
      await services.drop.execute(id, tenant, userName)
      return NextResponse.json({ data: { dropped: true } })
    }
    return NextResponse.json({ data: await services.approve.execute(id, tenant, userName, 'web') })
  } catch (err) {
    if (err instanceof CampaignClosedError) {
      return NextResponse.json({ error: { code: 'CAMPAIGN_CLOSED', message: err.message } }, { status: 409 })
    }
    throw err
  }
}

export const POST = withErrorHandler(postCampaignDecision)
