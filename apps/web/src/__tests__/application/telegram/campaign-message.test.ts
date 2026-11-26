// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { TelegramNotifier } from '@/application/telegram/TelegramNotifier'
import { campaignText } from '@/application/telegram/messages'
import { verifyCallbackData } from '@/domain/telegram/callback-data'
import type { Campaign, CampaignItem } from '@/domain/agent/campaign'
import type { TelegramRepository } from '@/domain/telegram/ports/TelegramRepository'

const KEY = 'campaign-key'
const CAMPAIGN_ID = '00000000-0000-4000-8000-0000000000cc'
const NOW = new Date('2026-11-27T06:00:00+07:00')

const campaign: Campaign = {
  id: CAMPAIGN_ID, htxCode: 'TC', day: '2026-11-27', status: 'draft',
  goals: [{ goalKey: 'harvest', labelVi: 'Duyệt thu hoạch', unitVi: 'thửa', target: 1 }],
  summaryVi: 'Hôm nay có hai việc, ưu tiên duyệt thu hoạch.', runId: null,
  decidedBy: null, decidedByName: null, decidedAt: null, telegramSent: false, createdAt: NOW,
}

function item(n: number): CampaignItem {
  return {
    campaignId: CAMPAIGN_ID, proposalId: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    position: n, goalKey: 'harvest', target: 1, kind: 'harvest.approve', risk: 'high', proposalStatus: 'proposed',
  }
}

describe('campaignText (C6)', () => {
  it('shows the day, the count, the summary and at most four items', () => {
    const items = [1, 2, 3, 4, 5].map((n) => ({ title: `Việc ${n}`, target: 1, unitVi: 'thửa' }))
    const text = campaignText('2026-11-27', 'Tóm tắt.', items)
    expect(text.split('\n')).toEqual([
      'Chiến dịch ngày 27/11: 5 việc',
      'Tóm tắt.',
      '1. Việc 1 · 1 thửa',
      '2. Việc 2 · 1 thửa',
      '3. Việc 3 · 1 thửa',
      '4. Việc 4 · 1 thửa',
      '… và 1 việc khác',
    ])
  })
})

describe('TelegramNotifier.enqueueCampaign (C6)', () => {
  const env = { ...process.env }
  beforeEach(() => {
    process.env = { ...env, DXOS_TELEGRAM_CALLBACK_KEY: KEY }
  })
  afterEach(() => {
    process.env = env
  })

  it('queues one message per linked manager with the signed A, L and D buttons', async () => {
    const enqueue = jest.fn(async () => undefined)
    const markTelegramSent = jest.fn(async () => undefined)
    const repo = {
      userLinkRecipients: jest.fn(async () => [{ chatId: '42' }, { chatId: '43' }]),
      enqueue,
    } as unknown as TelegramRepository
    const campaigns = {
      findById: jest.fn(async () => campaign),
      items: jest.fn(async () => [item(1), item(2)]),
      markTelegramSent,
    }
    const notifier = new TelegramNotifier({ repo, proposals: { findById: jest.fn() } as never, campaigns: campaigns as never, now: () => NOW })

    await notifier.enqueueCampaign('TC', CAMPAIGN_ID)

    expect(repo.userLinkRecipients).toHaveBeenCalledWith('TC', ['manager'])
    const rows = enqueue.mock.calls[0][0] as { chatId: string; text: string; buttons: { callback_data: string }[][] }[]
    expect(rows.map((r) => r.chatId)).toEqual(['42', '43'])
    expect(rows[0].text).toContain('Chiến dịch ngày 27/11: 2 việc')
    const [[approveAll], [list, drop]] = rows[0].buttons as unknown as { callback_data: string }[][]
    expect(verifyCallbackData(KEY, approveAll.callback_data)).toEqual({ proposalId: CAMPAIGN_ID, op: 'A' })
    expect(verifyCallbackData(KEY, list.callback_data)).toEqual({ proposalId: CAMPAIGN_ID, op: 'L' })
    expect(verifyCallbackData(KEY, drop.callback_data)).toEqual({ proposalId: CAMPAIGN_ID, op: 'D' })
    expect(markTelegramSent).toHaveBeenCalledWith('TC', CAMPAIGN_ID)
  })
})
