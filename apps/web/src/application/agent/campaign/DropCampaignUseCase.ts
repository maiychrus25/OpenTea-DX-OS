// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { CampaignRepository } from '@/domain/agent/ports/CampaignRepository'
import { NotFoundError } from '@/domain/errors'
import type { Tenant } from '@/lib/api/tenant'
import { CampaignClosedError } from './campaign-errors'
import { OPEN_CAMPAIGN_STATUSES } from './ApproveCampaignUseCase'

/** Drops the day's campaign. Its items become ordinary proposals again (contract C7). */
export class DropCampaignUseCase {
  constructor(private readonly campaigns: Pick<CampaignRepository, 'findById' | 'setStatus'>) {}

  async execute(campaignId: string, tenant: Tenant, userName: string): Promise<void> {
    const campaign = await this.campaigns.findById(tenant.htxCode, campaignId)
    if (!campaign) throw new NotFoundError('Không tìm thấy chiến dịch')
    const moved = await this.campaigns.setStatus(tenant.htxCode, campaignId, {
      to: 'dropped',
      from: OPEN_CAMPAIGN_STATUSES,
      decidedBy: { userId: tenant.userId, userName },
      event: { op: 'agent.campaign.dropped', details: {} },
    })
    if (!moved) throw new CampaignClosedError()
  }
}
