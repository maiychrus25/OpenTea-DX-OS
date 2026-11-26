/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { TelegramNotifier } from '@/application/telegram/TelegramNotifier'
import { templateReminderLines, vnIsoWeekday, vnMondayOf } from '@/application/telegram/improvement-lines'
import type { Campaign } from '@/domain/agent/campaign'
import type { Improvement } from '@/domain/agent/ports/ImprovementRepository'

const CAMPAIGN_ID = '00000000-0000-4000-8000-0000000000c9'

function template(title: string): Improvement {
  return {
    id: '00000000-0000-4000-8000-0000000000a1', htxCode: 'TC', week: '2026-11-23', kind: 'template', metricKey: 'missed_days:harvest',
    titleVi: title, rationaleVi: 'r', baseline: 4, evidence: {}, proposalId: null, status: 'adopted', decidedBy: 'mgr-1',
    adoptedAt: new Date(), effect: {}, template: { weekday: 1, goal_key: 'harvest', title_vi: title }, createdAt: new Date(),
  }
}

function campaign(day: string): Campaign {
  return {
    id: CAMPAIGN_ID, htxCode: 'TC', day, status: 'approved',
    goals: [{ goalKey: 'harvest', labelVi: 'Duyệt thu hoạch', unitVi: 'thửa', target: 1 }],
    summaryVi: 'Tóm tắt.', runId: null, decidedBy: null, decidedByName: null, decidedAt: null, telegramSent: false, createdAt: new Date(),
  }
}

describe('Vietnam weekday and week helpers', () => {
  it('weekday is 1 for Monday and 7 for Sunday, in Vietnam time', () => {
    expect(vnIsoWeekday('2026-11-30')).toBe(1)
    expect(vnIsoWeekday('2026-12-01')).toBe(2)
    expect(vnIsoWeekday('2026-12-06')).toBe(7)
  })

  it('the Monday of an instant is its Vietnam Monday', () => {
    expect(vnMondayOf(new Date('2026-12-02T16:59:00Z'))).toBe('2026-11-30') // Thursday 2 Dec 23:59 Vietnam
    expect(vnMondayOf(new Date('2026-11-29T18:00:00Z'))).toBe('2026-11-30') // Monday 30 Nov 01:00 Vietnam
  })

  it('shows at most two reminder lines, each with its title', () => {
    const lines = templateReminderLines([template('A'), template('B'), template('C')])
    expect(lines).toEqual(['Nhắc theo mẫu: A', 'Nhắc theo mẫu: B'])
  })
})

describe('campaign message reminders (contract C7)', () => {
  function notifier(activeTemplates: jest.Mock) {
    const campaigns = {
      findById: jest.fn(async () => campaign('2026-11-30')),
      items: jest.fn(async () => []),
      markTelegramSent: jest.fn(),
      findForDay: jest.fn(),
      writeOutcomes: jest.fn(),
      setStatus: jest.fn(),
    }
    return new TelegramNotifier({
      repo: {} as never,
      proposals: { findById: jest.fn() } as never,
      campaigns: campaigns as never,
      improvements: { activeTemplates } as never,
    })
  }

  it('adds the reminders of the campaign weekday to the 06:00 message', async () => {
    const activeTemplates = jest.fn(async () => [template('Nhắc thu hoạch')])
    const message = await notifier(activeTemplates).campaignMessage('TC', CAMPAIGN_ID)
    expect(activeTemplates).toHaveBeenCalledWith('TC', 1)
    expect(message!.text.split('\n')).toContain('Nhắc theo mẫu: Nhắc thu hoạch')
  })
})
