// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { REPORT_SECTIONS, type ReportSection } from '@/domain/report/views'

/** The report covers at most three years, as the season.csv route does. */
export const MAX_REPORT_DAYS = 3 * 366

export const SECTION_LABELS: Record<ReportSection, string> = {
  members: 'Nông hộ và diện tích',
  purchases: 'Thu mua búp',
  member_money: 'Tiền xã viên',
  processing: 'Chế biến',
  lots: 'Lô hàng và chứng nhận',
  sales: 'Bán hàng',
  safety: 'An toàn sản xuất',
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** Days between two Vietnam days, inclusive; null when either is not a YYYY-MM-DD day. */
function spanDays(from: string, to: string): number | null {
  if (!DAY.test(from) || !DAY.test(to)) return null
  const ms = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()
  return Math.round(ms / 86400000) + 1
}

/** The first problem with a period, in the words the page shows; null when it can be used. */
export function periodProblem(from: string | undefined, to: string | undefined): string | null {
  if (!from || !to) return 'Chọn ngày bắt đầu và ngày kết thúc.'
  const span = spanDays(from, to)
  if (span === null) return 'Ngày không hợp lệ.'
  if (span < 1) return 'Ngày kết thúc phải sau hoặc cùng ngày bắt đầu.'
  if (span > MAX_REPORT_DAYS) return 'Báo cáo tối đa ba năm.'
  return null
}

/** The period of a whole calendar year, as YYYY-MM-DD. */
export function yearPeriod(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}

/** The CSV link of one section for the period. */
export function reportCsvHref(section: ReportSection, from: string, to: string): string {
  return `/api/reports/season.csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&section=${section}`
}

export { REPORT_SECTIONS }
