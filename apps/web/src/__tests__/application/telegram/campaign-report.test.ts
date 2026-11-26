// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { TelegramNotifier } from '@/application/telegram/TelegramNotifier'
import { reportText } from '@/application/telegram/messages'
import type { Campaign, CampaignItem, CampaignStatus } from '@/domain/agent/campaign'
import type { TelegramRepository } from '@/domain/telegram/ports/TelegramRepository'

const CAMPAIGN_ID = '00000000-0000-4000-8000-0000000000c9'
const NOW = new Date('2026-11-27T18:00:00+07:00')

function campaign(status: CampaignStatus = 'partial'): Campaign {
  return {
    id: CAMPAIGN_ID, htxCode: 'TC', day: '2026-11-27', status,
    goals: [
      { goalKey: 'harvest', labelVi: 'Duyệt thu hoạch', unitVi: 'thửa', target: 1 },
      { goalKey: 'journal_backlog', labelVi: 'Duyệt nhật ký tồn', unitVi: 'nhật ký', target: 2 },
      { goalKey: 'internal_notice', labelVi: 'Báo cán bộ', unitVi: 'tin', target: 2 },
    ],
    summaryVi: 'Tóm tắt.', runId: null, decidedBy: null, decidedByName: null, decidedAt: null, telegramSent: true, createdAt: NOW,
  }
}

function item(n: number, goalKey: string, target: number, proposalStatus: CampaignItem['proposalStatus']): CampaignItem {
  return {
    campaignId: CAMPAIGN_ID, proposalId: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    position: n, goalKey, target, kind: 'notification.internal', risk: 'low', proposalStatus,
  }
}

function notifierWith(record: CampaignRecord) {
  const enqueue = jest.fn(async (_rows: unknown[]) => undefined)
  const repo = {
    insertReportIfNew: jest.fn(async () => true),
    proposalCounts: jest.fn(async () => ({ open: 2, decided: 5 })),
    userLinkRecipients: jest.fn(async () => [{ chatId: '42' }]),
    groupLinkRecipients: jest.fn(async () => []),
    enqueue,
  } as unknown as TelegramRepository
  const notifier = new TelegramNotifier({
    repo,
    proposals: { findById: jest.fn() } as never,
    campaigns: record as never,
    now: () => NOW,
  })
  return { notifier, enqueue }
}

type CampaignRecord = {
  findForDay: jest.Mock; items: jest.Mock; writeOutcomes: jest.Mock; setStatus: jest.Mock
}

function records(c: Campaign | null, items: CampaignItem[]): CampaignRecord {
  return {
    findForDay: jest.fn(async () => c),
    items: jest.fn(async () => items),
    writeOutcomes: jest.fn(async () => undefined),
    setStatus: jest.fn(async () => true),
  }
}

const figures = { journals_new: 2, proposals_open: 2 }

describe('the 18:00 report and the daily campaign (C9)', () => {
  test('a campaign with three goals and two unfinished items adds its lines and writes the outcomes', async () => {
    const items = [
      item(1, 'harvest', 1, 'executed'),
      item(2, 'journal_backlog', 2, 'executed'),
      item(3, 'internal_notice', 1, 'proposed'),
      item(4, 'internal_notice', 1, 'proposed'),
    ]
    const record = records(campaign(), items)
    const { notifier, enqueue } = notifierWith(record)
    await notifier.enqueueReport('TC', 'daily', '2026-11-27', '2026-11-27', figures)

    const text = (enqueue.mock.calls[0][0] as { text: string }[])[0].text
    expect(text.split('\n')).toEqual([
      'Báo cáo ngày 27/11/2026',
      'Nhật ký mới: 2',
      'Đề xuất đang mở: 2 · đã xử lý: 5',
      'Chiến dịch hôm nay: 2/4 việc xong',
      '• Duyệt thu hoạch: 1/1 thửa',
      '• Duyệt nhật ký tồn: 2/2 nhật ký',
      '• Báo cán bộ: 0/2 tin',
      'Chưa xong: 2 việc',
    ])
    expect(record.writeOutcomes).toHaveBeenCalledWith('TC', CAMPAIGN_ID, [
      { goalKey: 'harvest', target: 1, actual: 1 },
      { goalKey: 'journal_backlog', target: 2, actual: 2 },
      { goalKey: 'internal_notice', target: 2, actual: 0 },
    ])
    expect(record.setStatus).not.toHaveBeenCalled()
  })

  test('a campaign whose items are all decided becomes done', async () => {
    const items = [item(1, 'harvest', 1, 'executed'), item(2, 'internal_notice', 1, 'rejected')]
    const record = records(campaign(), items)
    const { notifier } = notifierWith(record)
    await notifier.enqueueReport('TC', 'daily', '2026-11-27', '2026-11-27', figures)
    expect(record.setStatus).toHaveBeenCalledWith('TC', CAMPAIGN_ID, expect.objectContaining({ to: 'done', from: ['draft', 'approved', 'partial'] }))
  })

  test('a dropped campaign adds no campaign lines and writes no outcomes', async () => {
    const record = records(campaign('dropped'), [item(1, 'harvest', 1, 'proposed')])
    const { notifier, enqueue } = notifierWith(record)
    await notifier.enqueueReport('TC', 'daily', '2026-11-27', '2026-11-27', figures)
    const text = (enqueue.mock.calls[0][0] as { text: string }[])[0].text
    expect(text).not.toContain('Chiến dịch')
    expect(record.writeOutcomes).not.toHaveBeenCalled()
  })

  test('the weekly report carries no campaign lines', async () => {
    const record = records(campaign(), [item(1, 'harvest', 1, 'executed')])
    const { notifier } = notifierWith(record)
    await notifier.enqueueReport('TC', 'weekly', '2026-11-23', '2026-11-27', figures)
    expect(record.findForDay).not.toHaveBeenCalled()
  })

  test('the report keeps its eight-line limit by dropping the lowest-priority figure lines', () => {
    const lines = reportText('daily', '2026-11-27', '2026-11-27', {
      journals_new: 1, journals_approved: 1, journals_pending: 1, proposals_open: 1, proposals_decided: 1, disease_reports: 1, lots_created: 1,
    }, ['Chiến dịch hôm nay: 1/5 việc xong', '• a: 1/1 x', '• b: 0/1 x', '• c: 0/1 x', 'Chưa xong: 4 việc']).split('\n')
    expect(lines.length).toBeLessThanOrEqual(8)
    expect(lines[lines.length - 1]).toBe('Chưa xong: 4 việc')
    expect(lines.slice(-5)[0]).toBe('Chiến dịch hôm nay: 1/5 việc xong')
  })
})
