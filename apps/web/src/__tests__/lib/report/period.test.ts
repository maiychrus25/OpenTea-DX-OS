// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { MAX_REPORT_DAYS, periodProblem, reportCsvHref, yearPeriod } from '@/lib/report/period'

test('a period needs both days, in order, and at most three years', () => {
  expect(periodProblem(undefined, '2026-12-31')).toBe('Chọn ngày bắt đầu và ngày kết thúc.')
  expect(periodProblem('2026-12-31', '2026-01-01')).toBe('Ngày kết thúc phải sau hoặc cùng ngày bắt đầu.')
  expect(periodProblem('2026-1-1', '2026-12-31')).toBe('Ngày không hợp lệ.')
  expect(periodProblem('2026-01-01', '2026-01-01')).toBeNull()
  expect(periodProblem('2023-01-01', '2025-12-31')).toBeNull()
  expect(periodProblem('2022-01-01', '2026-12-31')).toBe('Báo cáo tối đa ba năm.')
  expect(MAX_REPORT_DAYS).toBe(1098)
})

test('a year period is the whole calendar year, and the CSV link names the section', () => {
  expect(yearPeriod(2026)).toEqual({ from: '2026-01-01', to: '2026-12-31' })
  expect(reportCsvHref('purchases', '2026-01-01', '2026-12-31')).toBe('/api/reports/season.csv?from=2026-01-01&to=2026-12-31&section=purchases')
})
