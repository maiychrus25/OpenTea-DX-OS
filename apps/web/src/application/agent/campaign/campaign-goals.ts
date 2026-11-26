// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export interface CampaignGoalOfItem {
  goalKey: string
  labelVi: string
  unitVi: string
  target: number
}

/** The only place that maps a proposal kind to its campaign goal (contract C2). */
export function campaignGoal(proposal: { kind: string; payload: Record<string, unknown> }): CampaignGoalOfItem {
  switch (proposal.kind) {
    case 'harvest.approve':
      return { goalKey: 'harvest', labelVi: 'Duyệt thu hoạch', unitVi: 'thửa', target: 1 }
    case 'journal.approve': {
      const ids = proposal.payload.entry_ids
      const target = Array.isArray(ids) ? ids.length : 0
      return { goalKey: 'journal_backlog', labelVi: 'Duyệt nhật ký tồn', unitVi: 'nhật ký', target }
    }
    case 'journal.reject':
      return { goalKey: 'journal_backlog', labelVi: 'Duyệt nhật ký tồn', unitVi: 'nhật ký', target: 1 }
    case 'disease.inspection':
      return { goalKey: 'inspection', labelVi: 'Kiểm tra vùng bệnh', unitVi: 'vùng', target: 1 }
    case 'notification.households':
      return { goalKey: 'households_notice', labelVi: 'Báo nông hộ', unitVi: 'tin', target: 1 }
    case 'notification.internal':
      return { goalKey: 'internal_notice', labelVi: 'Báo cán bộ', unitVi: 'tin', target: 1 }
    case 'bulletin.publish':
      return { goalKey: 'bulletin', labelVi: 'Đăng bản tin', unitVi: 'bản', target: 1 }
    default:
      return { goalKey: 'other', labelVi: 'Việc khác', unitVi: 'việc', target: 1 }
  }
}
