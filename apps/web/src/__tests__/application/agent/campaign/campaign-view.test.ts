// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { campaignView } from '@/application/agent/campaign/campaign-view'
import type { Campaign, CampaignItem } from '@/domain/agent/campaign'

const campaign: Campaign = {
  id: 'c1', htxCode: 'TC', day: '2026-11-27', status: 'draft',
  goals: [{ goalKey: 'harvest', labelVi: 'Duyệt thu hoạch', unitVi: 'thửa', target: 1 }],
  summaryVi: 'Tóm tắt.', runId: null, decidedBy: null, decidedByName: null, decidedAt: null, telegramSent: true, createdAt: new Date(),
}

describe('campaignView', () => {
  it('lists items in position order with title, goal line, status and risk', () => {
    const items: CampaignItem[] = [
      { campaignId: 'c1', proposalId: 'p2', position: 2, goalKey: 'harvest', target: 1, kind: 'harvest.approve', risk: 'high', proposalStatus: 'proposed' },
      { campaignId: 'c1', proposalId: 'p1', position: 1, goalKey: 'other', target: 1, kind: 'unknown.kind', risk: 'low', proposalStatus: 'executed' },
    ]
    const view = campaignView(campaign, items)
    expect(view).toEqual({
      id: 'c1',
      day: '2026-11-27',
      status: 'draft',
      summaryVi: 'Tóm tắt.',
      decidedByName: null,
      items: [
        { position: 1, proposalId: 'p1', kind: 'unknown.kind', titleVi: 'unknown.kind', status: 'executed', risk: 'low', goalLine: '1 việc' },
        { position: 2, proposalId: 'p2', kind: 'harvest.approve', titleVi: 'Duyệt thu hoạch', status: 'proposed', risk: 'high', goalLine: '1 thửa' },
      ],
    })
  })
})
