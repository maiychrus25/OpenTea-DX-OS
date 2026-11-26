// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { campaignGoal } from '@/application/agent/campaign/campaign-goals'

describe('campaignGoal (C2)', () => {
  it.each([
    ['harvest.approve', {}, { goalKey: 'harvest', labelVi: 'Duyệt thu hoạch', unitVi: 'thửa', target: 1 }],
    ['disease.inspection', {}, { goalKey: 'inspection', labelVi: 'Kiểm tra vùng bệnh', unitVi: 'vùng', target: 1 }],
    ['notification.households', {}, { goalKey: 'households_notice', labelVi: 'Báo nông hộ', unitVi: 'tin', target: 1 }],
    ['notification.internal', {}, { goalKey: 'internal_notice', labelVi: 'Báo cán bộ', unitVi: 'tin', target: 1 }],
    ['bulletin.publish', {}, { goalKey: 'bulletin', labelVi: 'Đăng bản tin', unitVi: 'bản', target: 1 }],
    ['journal.reject', {}, { goalKey: 'journal_backlog', labelVi: 'Duyệt nhật ký tồn', unitVi: 'nhật ký', target: 1 }],
    ['unknown.kind', {}, { goalKey: 'other', labelVi: 'Việc khác', unitVi: 'việc', target: 1 }],
  ])('%s maps to its goal', (kind, payload, expected) => {
    expect(campaignGoal({ kind, payload })).toEqual(expected)
  })

  it('journal.approve counts the entries it approves', () => {
    expect(campaignGoal({ kind: 'journal.approve', payload: { entry_ids: ['a', 'b', 'c'] } })).toEqual({
      goalKey: 'journal_backlog',
      labelVi: 'Duyệt nhật ký tồn',
      unitVi: 'nhật ký',
      target: 3,
    })
  })
})
