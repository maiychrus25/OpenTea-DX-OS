// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { proposalResultText, reportText } from '@/application/telegram/messages'
import type { Proposal } from '@/domain/agent/proposal'

function proposal(overrides: Partial<Proposal>): Proposal {
  return {
    id: 'p', htxCode: 'TC', runId: null, agent: 'journal-review', kind: 'journal.approve', payload: {},
    reasonVi: '', evidence: { rows: [], sha256: '' }, confidence: null, risk: 'medium', status: 'proposed',
    origin: 'agent', requestedBy: null, dedupeKey: '', createdAt: new Date(), expiresAt: new Date(),
    decidedBy: null, decidedByName: 'Anh An', decidedAt: new Date('2026-11-24T03:05:00Z'),
    decisionChannel: 'telegram', decisionNote: null, editedPayload: null, executedAt: null, result: null,
    ...overrides,
  }
}

describe('Telegram message wording', () => {
  test('a decided proposal reads who decided it, the time in Vietnam, and the outcome', () => {
    expect(proposalResultText(proposal({ status: 'executed' }))).toBe('Đã được Anh An duyệt lúc 10:05, đã thực hiện.')
    expect(proposalResultText(proposal({ status: 'failed' }))).toBe('Đã được Anh An duyệt lúc 10:05, thực hiện lỗi.')
    expect(proposalResultText(proposal({ status: 'rejected', decisionNote: 'Thiếu ảnh' }))).toBe('Đã từ chối: Thiếu ảnh')
    expect(proposalResultText(proposal({ status: 'sent_to_staff_app' }))).toBe('Đã được Anh An duyệt lúc 10:05. Đã gửi app nhân sự.')
    expect(proposalResultText(proposal({ status: 'proposed' }))).toBeNull()
  })

  test('a daily report with missing figures leaves those lines out and stays under five lines', () => {
    const text = reportText('daily', '2026-11-24', '2026-11-24', {
      journals_new: 3,
      journals_approved: 2,
      proposals_open: 1,
      proposals_decided: 4,
    })
    expect(text).toBe('Báo cáo ngày 24/11/2026\nNhật ký mới: 3 · đã duyệt: 2\nĐề xuất đang mở: 1 · đã xử lý: 4')
    expect(text.split('\n').length).toBeLessThanOrEqual(8)
  })

  test('a weekly report shows the range', () => {
    expect(reportText('weekly', '2026-11-18', '2026-11-24', { lots_created: 2 })).toBe(
      'Báo cáo tuần 18/11/2026 – 24/11/2026\nLô mới: 2'
    )
  })
})
