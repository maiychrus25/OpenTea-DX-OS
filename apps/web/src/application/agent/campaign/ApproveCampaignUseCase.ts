// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { CampaignRepository } from '@/domain/agent/ports/CampaignRepository'
import type { CampaignStatus } from '@/domain/agent/campaign'
import type { DecisionChannel } from '@/domain/agent/proposal'
import { NotFoundError } from '@/domain/errors'
import type { Tenant } from '@/lib/api/tenant'
import { logger } from '@/lib/logger'
import { ensureAppActions, getAction, type ApproverRole } from '../action-catalog'
import type { DecideProposalInput, DecideProposalOutcome } from '../DecideProposalUseCase'
import { CampaignClosedError } from './campaign-errors'

export const OPEN_CAMPAIGN_STATUSES: readonly CampaignStatus[] = ['draft', 'partial']

/** Outcomes after which the proposal's Telegram messages show the decision. */
const SYNC_OUTCOMES = new Set(['executed', 'failed', 'rejected', 'stale', 'expired'])

export interface ApproveCampaignResult {
  executed: number
  waitingHigh: number
  forwarded: number
  failed: number
  alreadyDecided: number
}

export interface ApproveCampaignDeps {
  campaigns: Pick<CampaignRepository, 'findById' | 'items' | 'setStatus'>
  decide(input: DecideProposalInput): Promise<DecideProposalOutcome>
  /** Sends an item the approver may not decide to the linked users who may (TelegramNotifier.enqueueProposal). */
  forward(htxCode: string, proposalId: string): Promise<void>
  syncDecision(htxCode: string, proposalId: string): Promise<void>
}

/**
 * Approve all (contract C7): runs every item the approver may decide through DecideProposalUseCase.
 * `high` items wait for their own confirmation; items of other kinds are forwarded. One item never stops the rest.
 */
export class ApproveCampaignUseCase {
  constructor(private readonly deps: ApproveCampaignDeps) {}

  async execute(
    campaignId: string,
    tenant: Tenant,
    userName: string,
    channel: DecisionChannel,
    now: Date = new Date()
  ): Promise<ApproveCampaignResult> {
    const campaign = await this.deps.campaigns.findById(tenant.htxCode, campaignId)
    if (!campaign) throw new NotFoundError('Không tìm thấy chiến dịch')
    if (!OPEN_CAMPAIGN_STATUSES.includes(campaign.status)) throw new CampaignClosedError()

    const result: ApproveCampaignResult = { executed: 0, waitingHigh: 0, forwarded: 0, failed: 0, alreadyDecided: 0 }
    const items = await this.deps.campaigns.items(tenant.htxCode, campaignId)
    await ensureAppActions(items.map((item) => item.kind))
    for (const item of items) {
      if (item.proposalStatus !== 'proposed') {
        result.alreadyDecided += 1
        continue
      }
      if (item.risk === 'high') {
        result.waitingHigh += 1
        continue
      }
      const definition = getAction(item.kind, tenant.htxCode)
      if (!definition) {
        result.failed += 1
        continue
      }
      if (!definition.approverRoles.includes(tenant.role as ApproverRole)) {
        result.forwarded += 1
        await this.forward(tenant.htxCode, item.proposalId)
        continue
      }
      await this.approveItem(item.proposalId, tenant, userName, channel, now, result)
    }

    const status: CampaignStatus = result.waitingHigh === 0 && result.forwarded === 0 ? 'approved' : 'partial'
    const moved = await this.deps.campaigns.setStatus(tenant.htxCode, campaignId, {
      to: status,
      from: OPEN_CAMPAIGN_STATUSES,
      decidedBy: { userId: tenant.userId, userName },
      event: { op: 'agent.campaign.approved', details: { ...result } },
    })
    if (!moved) throw new CampaignClosedError()
    return result
  }

  private async approveItem(
    proposalId: string,
    tenant: Tenant,
    userName: string,
    channel: DecisionChannel,
    now: Date,
    result: ApproveCampaignResult
  ): Promise<void> {
    try {
      const outcome = await this.deps.decide({ proposalId, tenant, userName, decision: 'approve', channel, now })
      if (outcome.outcome === 'executed') result.executed += 1
      else if (outcome.outcome === 'already_decided') result.alreadyDecided += 1
      else result.failed += 1
      if (SYNC_OUTCOMES.has(outcome.outcome)) await this.sync(tenant.htxCode, proposalId)
    } catch (err) {
      result.failed += 1
      logger.error('Campaign: an item decision failed', { proposalId, err })
    }
  }

  private async forward(htxCode: string, proposalId: string): Promise<void> {
    try {
      await this.deps.forward(htxCode, proposalId)
    } catch (err) {
      logger.error('Campaign: could not forward an item', { proposalId, err })
    }
  }

  private async sync(htxCode: string, proposalId: string): Promise<void> {
    try {
      await this.deps.syncDecision(htxCode, proposalId)
    } catch (err) {
      logger.error('Campaign: could not sync a proposal message', { proposalId, err })
    }
  }
}
