// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { ReportSection, SeasonReport } from '@/domain/report/views'
import { DRY_TEA_GRADE_LABELS } from '@/domain/processing/grades'
import { toCsv } from '@/infrastructure/db/weighing/csv'

type Table = [header: string[], rows: string[][]]

const s = (n: number | string | null) => (n === null ? '' : String(n))

/** One CSV table per section, columns in Vietnamese; null when the section did not load. */
export function reportSectionCsv(report: SeasonReport, section: ReportSection): string | null {
  const table = tableOf(report, section)
  return table ? toCsv(table[0], table[1]) : null
}

function tableOf(r: SeasonReport, section: ReportSection): Table | null {
  switch (section) {
    case 'members':
      return r.members && [['Số hộ', 'Số thửa', 'Diện tích (ha)'], [[s(r.members.households), s(r.members.parcels), s(r.members.area_ha)]]]
    case 'purchases':
      return r.purchases && [
        ['Tháng', 'Kg tịnh', 'Thành tiền (đ)', 'Số phiếu'],
        [...r.purchases.months.map((m) => [m.month, s(m.net_kg), m.amount_vnd, s(m.tickets)]), ['Tổng', s(r.purchases.total.net_kg), r.purchases.total.amount_vnd, s(r.purchases.total.tickets)]],
      ]
    case 'member_money':
      return r.member_money && [['Số kỳ đã chốt', 'Đã chi trả (đ)', 'Còn phải trả (đ)', 'Vật tư đã ứng (đ)'], [[s(r.member_money.periods_closed), r.member_money.paid_vnd, r.member_money.payable_open_vnd, r.member_money.advances_vnd]]]
    case 'processing':
      return r.processing && [
        ['Hạng', 'Kg khô'],
        [...r.processing.by_grade.map((g) => [DRY_TEA_GRADE_LABELS[g.grade], s(g.kg)]), ['Số mẻ', s(r.processing.batches)], ['Kg tươi vào', s(r.processing.fresh_kg)], ['Kg khô ra', s(r.processing.dry_kg)], ['Tỷ lệ bình quân', s(r.processing.avg_ratio)], ['Số mẻ lệch', s(r.processing.out_of_band)]],
      ]
    case 'lots':
      return r.lots && [
        ['Loại', 'Số hiệu', 'Nơi cấp', 'Hết hạn'],
        [['Tổng quan', `${r.lots.lots} lô, ${r.lots.exported} đã xuất QR`, `${r.lots.kg} kg`, ''], ...r.lots.certificates_valid.map((c) => [c.kind, c.number, c.issuer, c.expires_on])],
      ]
    case 'safety':
      return r.safety && [['Lần phun đã duyệt', 'Thửa nghiệm thu'], [[s(r.safety.sprayings_approved), s(r.safety.harvests_approved)]]]
    case 'sales':
      return null // TODO(R2): sales table after S8 merges
  }
}
