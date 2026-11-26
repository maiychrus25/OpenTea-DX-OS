/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { TelegramNotifier } from '@/application/telegram/TelegramNotifier'
import type { Improvement } from '@/domain/agent/ports/ImprovementRepository'
import type { TelegramRepository } from '@/domain/telegram/ports/TelegramRepository'

// Monday 30 November 2026, 07:00 in Vietnam: the time of the weekly report.
const NOW = new Date('2026-11-30T00:00:00Z')
const FIGURES = { journals_new: 3, journals_approved: 2, journals_pending: 1 }

function improvement(title: string, effect: Improvement['effect']): Improvement {
  return {
    id: `00000000-0000-4000-8000-${title.length.toString().padStart(12, '0')}`,
    htxCode: 'TC', week: '2026-11-23', kind: 'setting', metricKey: 'm', titleVi: title, rationaleVi: 'r', baseline: 0.5,
    evidence: {}, proposalId: null, status: 'measured', decidedBy: 'mgr-1', adoptedAt: null, effect, template: null, createdAt: NOW,
  }
}

function notifierWith(improvements: Record<string, unknown>) {
  const enqueue = jest.fn(async (_rows: unknown[]) => undefined)
  const repo = {
    insertReportIfNew: jest.fn(async () => true),
    proposalCounts: jest.fn(async () => ({ open: 0, decided: 0 })),
    userLinkRecipients: jest.fn(async () => [{ chatId: '42' }]),
    groupLinkRecipients: jest.fn(async () => []),
    enqueue,
  } as unknown as TelegramRepository
  const notifier = new TelegramNotifier({ repo, proposals: { findById: jest.fn() } as never, improvements: improvements as never, now: () => NOW })
  return { notifier, enqueue }
}

function sentText(enqueue: jest.Mock): string {
  return (enqueue.mock.calls[0][0] as { text: string }[])[0].text
}

describe('weekly report lines (contract C6)', () => {
  it('appends the created count and the verdicts of the week after the figures', async () => {
    const measured = [
      improvement('Nới ngưỡng cảm biến', { after_2w: { value: 0.4, verdict: 'helped', at: '2026-11-27T02:00:00.000Z' } }),
      improvement('Nhắc thu hoạch', { after_4w: { value: 0.9, verdict: 'drop', at: '2026-11-26T02:00:00.000Z' } }),
    ]
    const { notifier, enqueue } = notifierWith({
      countForWeek: jest.fn(async () => 2),
      measuredBetween: jest.fn(async () => measured),
      activeTemplates: jest.fn(),
    })
    await notifier.enqueueReport('TC', 'weekly', '2026-11-23', '2026-11-29', FIGURES)
    const lines = sentText(enqueue).split('\n')
    expect(lines.slice(-3)).toEqual(['Cải tiến tuần này: 2 đề xuất', 'Đã giúp: Nới ngưỡng cảm biến', 'Nên bỏ: Nhắc thu hoạch'])
    expect(lines.length).toBeLessThanOrEqual(8)
  })

  it('asks for the week of the report Monday and the seven days before it', async () => {
    const countForWeek = jest.fn(async () => 0)
    const measuredBetween = jest.fn(async () => [])
    const { notifier } = notifierWith({ countForWeek, measuredBetween, activeTemplates: jest.fn() })
    await notifier.enqueueReport('TC', 'weekly', '2026-11-23', '2026-11-29', FIGURES)
    expect(countForWeek).toHaveBeenCalledWith('TC', '2026-11-30')
    expect(measuredBetween).toHaveBeenCalledWith('TC', new Date(NOW.getTime() - 7 * 86_400_000), NOW)
  })

  it('adds no improvement line when nothing was created or measured', async () => {
    const { notifier, enqueue } = notifierWith({ countForWeek: jest.fn(async () => 0), measuredBetween: jest.fn(async () => []), activeTemplates: jest.fn() })
    await notifier.enqueueReport('TC', 'weekly', '2026-11-23', '2026-11-29', FIGURES)
    expect(sentText(enqueue)).not.toContain('Cải tiến')
  })

  it('keeps at most three improvement lines', async () => {
    const measured = ['A', 'B', 'C', 'D'].map((t) => improvement(t, { after_2w: { value: 1, verdict: 'no_effect', at: '2026-11-27T02:00:00.000Z' } }))
    const { notifier, enqueue } = notifierWith({ countForWeek: jest.fn(async () => 1), measuredBetween: jest.fn(async () => measured), activeTemplates: jest.fn() })
    await notifier.enqueueReport('TC', 'weekly', '2026-11-23', '2026-11-29', FIGURES)
    const improvementLines = sentText(enqueue).split('\n').filter((l) => l.startsWith('Cải tiến') || l.startsWith('Chưa thấy'))
    expect(improvementLines).toHaveLength(3)
  })

  it('the daily report has no improvement lines', async () => {
    const countForWeek = jest.fn(async () => 2)
    const { notifier, enqueue } = notifierWith({ countForWeek, measuredBetween: jest.fn(async () => []), activeTemplates: jest.fn() })
    await notifier.enqueueReport('TC', 'daily', '2026-11-30', '2026-11-30', FIGURES)
    expect(countForWeek).not.toHaveBeenCalled()
    expect(sentText(enqueue)).not.toContain('Cải tiến')
  })
})
