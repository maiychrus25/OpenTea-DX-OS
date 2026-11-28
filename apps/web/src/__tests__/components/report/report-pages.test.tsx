// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ReportView } from '@/components/features/report/ReportView'
import { ReportPicker } from '@/components/features/report/ReportPicker'
import { REPORT_SECTIONS, type SeasonReport } from '@/domain/report/views'
import { SECTION_LABELS } from '@/lib/report/period'

const full: SeasonReport = {
  htx_name: 'HTX Tân Cương', from: '2026-01-01', to: '2026-12-31', generated_at: '2026-11-28T03:00:00Z',
  members: { households: 12, parcels: 30, area_ha: 18.5 },
  purchases: {
    total: { net_kg: 1200.5, amount_vnd: '15000000', tickets: 40 },
    months: [{ month: '2026-11', net_kg: 300, amount_vnd: '3900000', tickets: 10 }],
    by_grade: [{ grade_name: 'Loại 1', net_kg: 1200.5, amount_vnd: '15000000' }],
  },
  member_money: { periods_closed: 3, paid_vnd: '9000000', payable_open_vnd: '500000', advances_vnd: '1200000' },
  processing: { batches: 6, fresh_kg: 1200, dry_kg: 250, avg_ratio: 4.8, out_of_band: 1, by_grade: [{ grade: 'DINH', kg: 80 }] },
  lots: { lots: 5, exported: 4, kg: 240, certificates_valid: [{ kind: 'VIETGAP', number: 'VG-1', issuer: 'Chi cục', expires_on: '2027-01-01' }] },
  sales: null,
  safety: { sprayings_approved: 22, harvests_approved: 7 },
}

describe('season report view', () => {
  test('the seven sections come in the spec order, each with its own CSV link', () => {
    render(<ReportView report={full} pickerHref="/manager/reports" />)
    const headings = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)
    expect(headings).toEqual(REPORT_SECTIONS.map(s => SECTION_LABELS[s]))
    const purchases = screen.getByRole('region', { name: SECTION_LABELS.purchases })
    expect(within(purchases).getByRole('link', { name: 'Tải CSV' })).toHaveAttribute('href', '/api/reports/season.csv?from=2026-01-01&to=2026-12-31&section=purchases')
  })

  test('a section that failed says so, and the others still show', () => {
    render(<ReportView report={full} pickerHref="/manager/reports" />)
    const sales = screen.getByRole('region', { name: SECTION_LABELS.sales })
    expect(within(sales).getByText('Chưa tải được phần này')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: SECTION_LABELS.safety })).toHaveTextContent('Lần phun đã duyệt')
  })

  test('the header names the cooperative, the period and when it was made, and the signature row is there', () => {
    render(<ReportView report={full} pickerHref="/manager/reports" />)
    expect(screen.getByText('HTX Tân Cương')).toBeInTheDocument()
    expect(screen.getByText('Kỳ báo cáo: 01/01/2026 – 31/12/2026')).toBeInTheDocument()
    expect(screen.getByText('Chủ tịch HĐQT')).toBeInTheDocument()
    expect(screen.getByText('Kế toán')).toBeInTheDocument()
  })

  test('the print button opens the browser print dialog', () => {
    window.print = jest.fn()
    render(<ReportView report={full} pickerHref="/manager/reports" />)
    fireEvent.click(screen.getByRole('button', { name: 'In báo cáo' }))
    expect(window.print).toHaveBeenCalledTimes(1)
  })

  test('a period with no rows says so in each table', () => {
    render(<ReportView report={{ ...full, purchases: { ...full.purchases!, months: [] } }} pickerHref="/manager/reports" />)
    expect(screen.getByText('Không có dữ liệu trong kỳ này.')).toBeInTheDocument()
  })
})

describe('season report picker', () => {
  test('the picker offers this year, last year and a custom range that posts to the view', () => {
    render(<ReportPicker basePath="/accountant" />)
    const thisYear = new Date().getFullYear()
    expect(screen.getByRole('link', { name: `Năm ${thisYear}` })).toHaveAttribute('href', `/accountant/reports/view?from=${thisYear}-01-01&to=${thisYear}-12-31`)
    expect(screen.getByRole('link', { name: `Năm ${thisYear - 1}` })).toHaveAttribute('href', `/accountant/reports/view?from=${thisYear - 1}-01-01&to=${thisYear - 1}-12-31`)
    const form = screen.getByRole('button', { name: 'Xem báo cáo' }).closest('form')!
    expect(form).toHaveAttribute('action', '/accountant/reports/view')
    expect(form).toHaveAttribute('method', 'get')
    expect(screen.getByLabelText('Từ ngày')).toHaveAttribute('name', 'from')
    expect(screen.getByLabelText('Đến ngày')).toHaveAttribute('name', 'to')
  })
})
