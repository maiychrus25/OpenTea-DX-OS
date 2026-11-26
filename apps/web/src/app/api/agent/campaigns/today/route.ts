// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { campaignView } from '@/application/agent/campaign/campaign-view'
import { vnDayOf } from '@/application/agent/campaign/vn-day'
import { PrismaCampaignRepository } from '@/infrastructure/db/agent/PrismaCampaignRepository'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

/** Today's campaign with its items for the inbox panel (contract C8). Managers and officers only. */
async function getTodayCampaign() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }
  const tenant = await requireTenant()
  if (tenant.role !== 'manager' && tenant.role !== 'officer') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 })
  }

  const campaigns = new PrismaCampaignRepository()
  const campaign = await campaigns.findForDay(tenant.htxCode, vnDayOf(new Date()))
  if (!campaign) return NextResponse.json({ campaign: null })
  return NextResponse.json({ campaign: campaignView(campaign, await campaigns.items(tenant.htxCode, campaign.id)) })
}

export const GET = withErrorHandler(getTodayCampaign)
