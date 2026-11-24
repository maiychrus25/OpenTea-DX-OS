// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { journalApproveAction } from '@/application/agent/actions/journal-approve.action'
import { journalRejectAction } from '@/application/agent/actions/journal-reject.action'
import type { JournalSubject } from '@/application/agent/actions/journal-labels'

const subjects = new Map<string, JournalSubject>([
  ['je_1', { id: 'je_1', parcel: 'TC-A3', activity: 'Bón phân', day: '22/11' }],
])

describe('journal proposal previews', () => {
  test('approve names the parcel, activity and day without ids', () => {
    expect(journalApproveAction.preview({ entry_ids: ['je_1'] }, subjects)).toEqual([
      'Duyệt nhật ký thửa TC-A3 · Bón phân · 22/11',
    ])
  })

  test('approve falls back to a plain nhật ký line when the label is missing', () => {
    expect(journalApproveAction.preview({ entry_ids: ['je_9'] }, subjects)).toEqual(['Duyệt nhật ký'])
  })

  test('reject asks for changes with the parcel and day, then the reason', () => {
    const payload = { entry_id: 'je_1', decision: 'REQUEST_CHANGES' as const, reason_code: 'DOSAGE' as const, reason_vi: 'Sai liều' }
    expect(journalRejectAction.preview(payload, subjects)).toEqual(['Yêu cầu sửa nhật ký thửa TC-A3 (22/11): Sai liều'])
  })

  test('reject without a label keeps the reason and shows no id', () => {
    const payload = { entry_id: 'je_9', decision: 'REJECTED' as const, reason_code: 'MISSING_INFO' as const, reason_vi: 'Thiếu thông tin' }
    expect(journalRejectAction.preview(payload)).toEqual(['Từ chối nhật ký: Thiếu thông tin'])
  })
})
