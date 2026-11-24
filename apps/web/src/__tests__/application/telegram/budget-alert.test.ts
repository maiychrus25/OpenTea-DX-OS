/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { TelegramNotifier } from '@/application/telegram/TelegramNotifier'

const MONTH_START = new Date('2026-10-31T17:00:00.000Z')

function fakeRepo(alreadyQueued: boolean) {
  return {
    healthRecentlyQueued: jest.fn().mockResolvedValue(alreadyQueued),
    userLinkRecipients: jest.fn().mockResolvedValue([{ chatId: 111 }]),
    enqueue: jest.fn().mockResolvedValue(undefined),
  }
}

describe('TelegramNotifier budget alerts', () => {
  test('queues one health message to the managers for a threshold of the month', async () => {
    const repo = fakeRepo(false)
    const notifier = new TelegramNotifier({ repo: repo as never, proposals: { findById: jest.fn() }, now: () => new Date('2026-11-15T03:00:00.000Z') })

    await notifier.queueBudgetAlert('TC', '2026-11', 80, 8.2, 10, MONTH_START)

    expect(repo.healthRecentlyQueued).toHaveBeenCalledWith('budget:TC:2026-11:80', MONTH_START)
    expect(repo.userLinkRecipients).toHaveBeenCalledWith('TC', ['manager'])
    const rows = repo.enqueue.mock.calls[0][0]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ htxCode: 'TC', chatId: 111, purpose: 'health', healthKey: 'budget:TC:2026-11:80' })
    expect(rows[0].text).toContain('Đã dùng 8.20 / 10.00 USD trong tháng 2026-11')
  })

  test('a threshold already queued this month is not queued again', async () => {
    const repo = fakeRepo(true)
    const notifier = new TelegramNotifier({ repo: repo as never, proposals: { findById: jest.fn() }, now: () => new Date() })

    await notifier.queueBudgetAlert('TC', '2026-11', 100, 10.5, 10, MONTH_START)

    expect(repo.enqueue).not.toHaveBeenCalled()
  })
})
