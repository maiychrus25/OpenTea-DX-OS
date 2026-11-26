// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ApproveCampaignUseCase } from '@/application/agent/campaign/ApproveCampaignUseCase'
import { CampaignClosedError } from '@/application/agent/campaign/campaign-errors'
import { DropCampaignUseCase } from '@/application/agent/campaign/DropCampaignUseCase'
import { DecideProposalUseCase } from '@/application/agent/DecideProposalUseCase'
import type { Campaign, CampaignItem, CampaignStatus } from '@/domain/agent/campaign'
import type { CampaignRepository } from '@/domain/agent/ports/CampaignRepository'
import type { Proposal } from '@/domain/agent/proposal'
import type { Tenant } from '@/lib/api/tenant'

const manager: Tenant = { userId: 'man-1', role: 'manager', htxCode: 'TC', htxProfileId: 'htx-tc' }
const officer: Tenant = { userId: 'off-1', role: 'officer', htxCode: 'TC', htxProfileId: 'htx-tc' }
const CAMPAIGN_ID = '00000000-0000-4000-8000-0000000000c1'

const pid = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`

function campaign(status: CampaignStatus): Campaign {
  return {
    id: CAMPAIGN_ID, htxCode: 'TC', day: '2026-11-27', status, goals: [], summaryVi: 'x', runId: null,
    decidedBy: null, decidedByName: null, decidedAt: null, telegramSent: false, createdAt: new Date(),
  }
}

function item(n: number, kind: string, risk: CampaignItem['risk'], proposalStatus: CampaignItem['proposalStatus'] = 'proposed'): CampaignItem {
  return { campaignId: CAMPAIGN_ID, proposalId: pid(n), position: n, goalKey: 'g', target: 1, kind, risk, proposalStatus }
}

function fakeCampaigns(status: CampaignStatus, items: CampaignItem[]) {
  return {
    findById: jest.fn(async () => campaign(status)),
    items: jest.fn(async () => items),
    setStatus: jest.fn(async () => true),
  }
}

function useCase(campaigns: ReturnType<typeof fakeCampaigns>, decide: jest.Mock) {
  return new ApproveCampaignUseCase({
    campaigns: campaigns as unknown as Pick<CampaignRepository, 'findById' | 'items' | 'setStatus'>,
    decide,
    forward: jest.fn(async () => undefined),
    syncDecision: jest.fn(async () => undefined),
  })
}

describe('ApproveCampaignUseCase (C7, test 14)', () => {
  it('approve all runs the items the manager may decide, keeps high items waiting and moves the campaign to partial', async () => {
    const campaigns = fakeCampaigns('draft', [
      item(1, 'notification.internal', 'low'),
      item(2, 'harvest.approve', 'high'),
      item(3, 'journal.approve', 'medium'),
    ])
    const decide = jest.fn(async () => ({ outcome: 'executed', result: {} }))
    const result = await useCase(campaigns, decide).execute(CAMPAIGN_ID, manager, 'Quản lý', 'web')

    expect(result).toEqual({ executed: 2, waitingHigh: 1, forwarded: 0, failed: 0, alreadyDecided: 0 })
    expect(decide.mock.calls.map((c) => (c[0] as { proposalId: string }).proposalId)).toEqual([pid(1), pid(3)])
    expect(campaigns.setStatus).toHaveBeenCalledWith('TC', CAMPAIGN_ID, expect.objectContaining({ to: 'partial', from: ['draft', 'partial'] }))
  })

  it('an officer sends the items only a manager may decide to the linked managers', async () => {
    const campaigns = fakeCampaigns('draft', [item(1, 'journal.approve', 'medium'), item(2, 'notification.internal', 'low')])
    const decide = jest.fn(async () => ({ outcome: 'executed', result: {} }))
    const uc = useCase(campaigns, decide)
    const result = await uc.execute(CAMPAIGN_ID, officer, 'Cán bộ', 'telegram')

    expect(result).toEqual({ executed: 1, waitingHigh: 0, forwarded: 1, failed: 0, alreadyDecided: 0 })
    expect(decide).toHaveBeenCalledTimes(1)
    expect(campaigns.setStatus).toHaveBeenCalledWith('TC', CAMPAIGN_ID, expect.objectContaining({ to: 'partial' }))
  })

  it('approve all continues past a stale and an already decided item', async () => {
    const campaigns = fakeCampaigns('draft', [
      item(1, 'notification.internal', 'low'),
      item(2, 'notification.internal', 'low'),
      item(3, 'notification.internal', 'low'),
      item(4, 'notification.internal', 'low', 'executed'),
    ])
    const decide = jest.fn()
      .mockResolvedValueOnce({ outcome: 'stale' })
      .mockResolvedValueOnce({ outcome: 'already_decided', by: 'Ai đó', at: null, status: 'rejected' })
      .mockResolvedValueOnce({ outcome: 'executed', result: {} })
    const result = await useCase(campaigns, decide).execute(CAMPAIGN_ID, manager, 'Quản lý', 'web')

    expect(result).toEqual({ executed: 1, waitingHigh: 0, forwarded: 0, failed: 1, alreadyDecided: 2 })
    expect(decide).toHaveBeenCalledTimes(3)
    expect(campaigns.setStatus).toHaveBeenCalledWith('TC', CAMPAIGN_ID, expect.objectContaining({ to: 'approved' }))
  })

  it('a thrown error in one item counts as failed and the rest still run', async () => {
    const campaigns = fakeCampaigns('partial', [item(1, 'notification.internal', 'low'), item(2, 'notification.internal', 'low')])
    const decide = jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ outcome: 'executed', result: {} })
    const result = await useCase(campaigns, decide).execute(CAMPAIGN_ID, manager, 'Quản lý', 'web')
    expect(result).toEqual({ executed: 1, waitingHigh: 0, forwarded: 0, failed: 1, alreadyDecided: 0 })
  })

  it('refuses a campaign that is no longer draft or partial', async () => {
    const campaigns = fakeCampaigns('approved', [item(1, 'notification.internal', 'low')])
    const decide = jest.fn()
    await expect(useCase(campaigns, decide).execute(CAMPAIGN_ID, manager, 'Quản lý', 'web')).rejects.toBeInstanceOf(CampaignClosedError)
    expect(decide).not.toHaveBeenCalled()
  })
})

describe('DropCampaignUseCase (C7)', () => {
  it.each([['draft'], ['partial']] as const)('drops a %s campaign', async (status) => {
    const campaigns = fakeCampaigns(status, [])
    await new DropCampaignUseCase(campaigns as unknown as Pick<CampaignRepository, 'findById' | 'setStatus'>).execute(CAMPAIGN_ID, manager, 'Quản lý')
    expect(campaigns.setStatus).toHaveBeenCalledWith('TC', CAMPAIGN_ID, expect.objectContaining({
      to: 'dropped', from: ['draft', 'partial'], decidedBy: { userId: 'man-1', userName: 'Quản lý' },
    }))
  })

  it('refuses to drop an approved or done campaign', async () => {
    const campaigns = fakeCampaigns('approved', [])
    campaigns.setStatus.mockResolvedValue(false)
    await expect(
      new DropCampaignUseCase(campaigns as unknown as Pick<CampaignRepository, 'findById' | 'setStatus'>).execute(CAMPAIGN_ID, manager, 'Quản lý')
    ).rejects.toBeInstanceOf(CampaignClosedError)
  })
})

describe('deciding an item moves a draft campaign to partial', () => {
  const proposal: Proposal = {
    id: pid(9), htxCode: 'TC', runId: null, agent: 'harvest-ready', kind: 'harvest.approve', payload: { parcel_id: 'parcel-1' },
    reasonVi: 'x', evidence: { rows: [], sha256: 'x' }, confidence: null, risk: 'high', status: 'proposed', origin: 'agent',
    requestedBy: null, dedupeKey: 'k', createdAt: new Date(), expiresAt: new Date(Date.now() + 86400_000), decidedBy: null,
    decidedByName: null, decidedAt: null, decisionChannel: null, decisionNote: null, editedPayload: null, executedAt: null, result: null,
  }
  function repo() {
    return {
      findById: jest.fn(async () => proposal),
      claim: jest.fn(async () => proposal),
      markRejected: jest.fn(),
      markStale: jest.fn(),
      markExpired: jest.fn(),
      markExecuted: jest.fn(async () => undefined),
      markFailed: jest.fn(async () => undefined),
    }
  }

  it('after a decision the draft campaign that holds the item becomes partial, and the outcome is unchanged', async () => {
    const campaigns = {
      itemOfDraftCampaign: jest.fn(async () => ({ id: CAMPAIGN_ID })),
      setStatus: jest.fn(async () => true),
    }
    const uc = new DecideProposalUseCase(repo(), undefined, async () => ({ parcel_id: 'parcel-1' }), campaigns as never)
    const outcome = await uc.execute({ proposalId: pid(9), tenant: manager, userName: 'Quản lý', decision: 'approve', channel: 'web' })

    expect(outcome.outcome).toBe('executed')
    expect(campaigns.itemOfDraftCampaign).toHaveBeenCalledWith('TC', pid(9))
    expect(campaigns.setStatus).toHaveBeenCalledWith('TC', CAMPAIGN_ID, expect.objectContaining({ to: 'partial', from: ['draft'] }))
  })

  it('a proposal in no draft campaign changes nothing', async () => {
    const campaigns = { itemOfDraftCampaign: jest.fn(async () => null), setStatus: jest.fn() }
    const uc = new DecideProposalUseCase(repo(), undefined, async () => ({}), campaigns as never)
    await uc.execute({ proposalId: pid(9), tenant: manager, userName: 'Quản lý', decision: 'approve', channel: 'web' })
    expect(campaigns.setStatus).not.toHaveBeenCalled()
  })
})
