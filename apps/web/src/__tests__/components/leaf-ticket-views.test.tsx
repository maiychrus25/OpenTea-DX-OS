// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import ManagerLeafTicketsPage from '@/app/manager/leaf-tickets/page'
import AccountantLeafTicketsPage from '@/app/accountant/leaf-tickets/page'

const ticket = {
  id: 't1', ticket_no: 'HTX-PC-20261128-001', household_id: 'h1', household_name: 'Nguyễn Văn A', parcel_id: 'p1', parcel_code: 'T-01',
  cycle_id: null, grade_id: 'g1', grade_name: 'Loại 1', weighed_at: '2026-11-28T03:00:00Z', gross_kg: 100, deduction_pct: 5,
  net_kg: 95, price_vnd_per_kg: 13000, amount_vnd: '1235000', status: 'VALID', void_reason: null, settlement_id: null,
}
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data })

let urls: string[]
let listBody: (url: string) => unknown

beforeEach(() => {
  urls = []
  listBody = () => ({ data: [ticket], next_cursor: null, totals: { net_kg: 95, amount_vnd: '1235000' } })
  global.fetch = jest.fn(async (url: string) => {
    urls.push(url)
    if (url.startsWith('/api/leaf-tickets/mine')) return ok({ data: [ticket] })
    if (url.startsWith('/api/leaf-tickets?')) return ok(listBody(url))
    return { ok: false, status: 500, json: async () => ({}) }
  }) as unknown as typeof fetch
})

describe("the head's ticket page", () => {
  test('reads every page of the day and shows the chosen ticket beside the list', async () => {
    listBody = url => url.includes('cursor=c1')
      ? { data: [{ ...ticket, id: 't2', ticket_no: 'HTX-PC-20261128-002' }], next_cursor: null, totals: { net_kg: 95, amount_vnd: '1235000' } }
      : { data: [ticket], next_cursor: 'c1', totals: { net_kg: 95, amount_vnd: '1235000' } }
    render(<ManagerLeafTicketsPage />)
    expect(await screen.findByRole('button', { name: 'HTX-PC-20261128-002' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Phiếu cân HTX-PC-20261128-001' })).toHaveTextContent('1.235.000 đ')
    expect(screen.getByRole('link', { name: 'In phiếu' })).toHaveAttribute('href', '/manager/leaf-tickets/t1/print')
    expect(screen.getByRole('button', { name: 'Hủy phiếu' })).toBeInTheDocument()
  })
})

describe('the ticket list of the accountant', () => {
  test('lists tickets with totals, and "Tải thêm" appends the next page', async () => {
    listBody = url => url.includes('cursor=c1')
      ? { data: [{ ...ticket, id: 't2', ticket_no: 'HTX-PC-20261128-002' }], next_cursor: null, totals: { net_kg: 95, amount_vnd: '1235000' } }
      : { data: [ticket], next_cursor: 'c1', totals: { net_kg: 95, amount_vnd: '1235000' } }
    render(<AccountantLeafTicketsPage />)
    expect(await screen.findByText('HTX-PC-20261128-001')).toBeInTheDocument()
    expect(screen.getByText('Tổng kg tịnh').closest('dl')).toHaveTextContent('95,0 kg')
    fireEvent.click(screen.getByRole('button', { name: 'Tải thêm' }))
    expect(await screen.findByText('HTX-PC-20261128-002')).toBeInTheDocument()
    expect(urls.some(u => u.includes('cursor=c1'))).toBe(true)
  })

  test('the accountant page shows the empty state for no tickets', async () => {
    listBody = () => ({ data: [], next_cursor: null, totals: { net_kg: 0, amount_vnd: '0' } })
    render(<AccountantLeafTicketsPage />)
    expect(await screen.findByText('Không có phiếu nào theo bộ lọc này.')).toBeInTheDocument()
  })

  test('a status filter and a date filter go into the query; CSV needs a date', async () => {
    render(<AccountantLeafTicketsPage />)
    await screen.findByText('HTX-PC-20261128-001')
    expect(screen.getByText('Chọn ngày để tải CSV.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'VOIDED' } })
    await waitFor(() => expect(urls.some(u => u.includes('status=VOIDED'))).toBe(true))
    fireEvent.change(screen.getByLabelText('Ngày'), { target: { value: '2026-11-28' } })
    await waitFor(() => expect(urls.some(u => u.includes('date=2026-11-28'))).toBe(true))
    expect(screen.getByRole('link', { name: 'Tải CSV của ngày đã chọn' })).toHaveAttribute('href', '/api/leaf-tickets/export.csv?from=2026-11-28&to=2026-11-28')
  })

  test('a failed list load shows the error', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch
    render(<AccountantLeafTicketsPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải dữ liệu')
  })
})
