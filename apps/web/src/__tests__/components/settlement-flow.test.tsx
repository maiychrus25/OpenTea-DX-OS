// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { SettlementPeriodView } from '@/components/features/ledger/SettlementPeriodView'
import { SettlementList } from '@/components/features/ledger/SettlementList'
import { SettlementSlip } from '@/components/features/ledger/SettlementSlip'

const period = { id: 'p1', code: 'HTX-QT-20261101-20261130', date_from: '2026-11-01', date_to: '2026-11-30', status: 'DRAFT', created_by_name: 'Kế toán', closed_by_name: null, closed_at: null }
const totals = { households: 2, leaf_amount_vnd: '2000000', advances_vnd: '500000', payable_vnd: '1500000', debt_out_vnd: '0' }
const lines = [
  { id: null, household_id: 'h1', household_name: 'Nguyễn Văn A', leaf_net_kg: 100, leaf_amount_vnd: '1500000', advances_vnd: '500000', debt_in_vnd: '0', payable_vnd: '1000000', debt_out_vnd: '0', paid_at: null, payment_method: null, payment_ref: null, has_bank_account: true },
  { id: null, household_id: 'h2', household_name: 'Trần Thị B', leaf_net_kg: 50, leaf_amount_vnd: '500000', advances_vnd: '0', debt_in_vnd: '0', payable_vnd: '500000', debt_out_vnd: '0', paid_at: null, payment_method: null, payment_ref: null, has_bank_account: false },
]
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data })

let closed: boolean
let closePosts: any[]
let payPosts: { url: string; body: any }[]
let closeResponses: (() => unknown)[]

beforeEach(() => {
  closed = false
  closePosts = []
  payPosts = []
  closeResponses = []
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    if (url === '/api/settlements/p1' && method === 'GET') {
      const detail = closed
        ? { period: { ...period, status: 'CLOSED', closed_by_name: 'Giám đốc' }, lines: lines.map(l => ({ ...l, id: 'l' + l.household_id })), totals }
        : { period, lines, totals }
      return ok({ data: detail })
    }
    if (url === '/api/settlements/p1/close') {
      closePosts.push(body)
      const next = closeResponses.shift()
      if (next) return next() as any
      closed = true
      return ok({ data: {} })
    }
    if (url === '/api/settlements/p1/lines/lh2/payout') { payPosts.push({ url, body }); return ok({ data: {} }) }
    if (url === '/api/settlements' && method === 'GET') return ok({ data: [] })
    if (url === '/api/settlements' && method === 'POST') return { ok: false, status: 422, json: async () => ({ error: { code: 'VALIDATION', message: 'Còn phiếu trước ngày bắt đầu kỳ.' } }) }
    if (url === '/api/settlements/p1/lines/l1/slip') return ok({ data: slipData(true) })
    if (url === '/api/settlements/p1/lines/l2/slip') return ok({ data: slipData(false) })
    return { ok: false, status: 404, json: async () => ({}) }
  }) as unknown as typeof fetch
})

function slipData(withQr: boolean) {
  return {
    htx: { name: 'HTX Chè Thái' }, household: { name: 'Nguyễn Văn A' }, period, tickets: [], advances: [],
    line: { ...lines[0], id: 'l1' },
    qr: withQr ? { data_url: 'data:image/png;base64,AAA', bank_name: 'Agribank', account_masked: '****1234', account_full: '8600201001234' } : null,
    transfer_note: 'QT 1101 A1B2',
  }
}

test('the manager sees the close button; the accountant does not', async () => {
  const { unmount } = render(<SettlementPeriodView periodId="p1" canClose basePath="/manager" />)
  expect(await screen.findByRole('button', { name: 'Chốt kỳ' })).toBeInTheDocument()
  unmount()
  render(<SettlementPeriodView periodId="p1" canClose={false} basePath="/accountant" />)
  await screen.findByText('Nguyễn Văn A')
  expect(screen.queryByRole('button', { name: 'Chốt kỳ' })).not.toBeInTheDocument()
})

test('a 409 PERIOD_CHANGED shows the new numbers and waits for a new click instead of closing', async () => {
  closeResponses.push(() => ({
    ok: false, status: 409,
    json: async () => ({ error: { code: 'PERIOD_CHANGED', message: 'Số liệu đã thay đổi.', totals: { ...totals, households: 3, payable_vnd: '1800000' } } }),
  }))
  render(<SettlementPeriodView periodId="p1" canClose basePath="/manager" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Chốt kỳ' }))
  expect(screen.getByText('Chốt kỳ HTX-QT-20261101-20261130: 2 hộ, tổng thực lĩnh 1.500.000 đ. Sau khi chốt không sửa được phiếu cân và phiếu ứng trong kỳ.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận chốt kỳ' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Số liệu đã thay đổi sau khi bạn mở hộp xác nhận')
  expect(screen.getByText('Chốt kỳ HTX-QT-20261101-20261130: 3 hộ, tổng thực lĩnh 1.800.000 đ. Sau khi chốt không sửa được phiếu cân và phiếu ứng trong kỳ.')).toBeInTheDocument()
  expect(closePosts).toEqual([{ expected_household_count: 2, expected_payable_total_vnd: '1500000' }])
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận chốt kỳ' }))
  expect(await screen.findByText('Kỳ đã được chốt.')).toBeInTheDocument()
  expect(closePosts[1]).toEqual({ expected_household_count: 3, expected_payable_total_vnd: '1800000' })
})

test('a payout is recorded with its method and reference, and a zero line gets no button', async () => {
  closed = true
  render(<SettlementPeriodView periodId="p1" canClose basePath="/manager" />)
  expect(await screen.findByText('Nguyễn Văn A')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Ghi đã trả Trần Thị B' }))
  fireEvent.change(screen.getByLabelText('Hình thức'), { target: { value: 'CASH' } })
  fireEvent.change(screen.getByLabelText('Mã tham chiếu (tuỳ chọn)'), { target: { value: 'TM-01' } })
  fireEvent.click(screen.getByRole('button', { name: 'Ghi đã trả' }))
  await waitFor(() => expect(payPosts).toHaveLength(1))
  expect(payPosts[0]).toEqual({ url: '/api/settlements/p1/lines/lh2/payout', body: { method: 'CASH', ref: 'TM-01' } })
})

test('a period with nothing to pay says so and offers no payout button', async () => {
  closed = true
  global.fetch = jest.fn(async () => ok({ data: { period: { ...period, status: 'CLOSED' }, lines: [{ ...lines[1], id: 'l2', payable_vnd: '0', debt_out_vnd: '0', leaf_amount_vnd: '0', advances_vnd: '0', leaf_net_kg: 0 }], totals: { ...totals, households: 1, payable_vnd: '0' } } })) as unknown as typeof fetch
  render(<SettlementPeriodView periodId="p1" canClose={false} basePath="/accountant" />)
  expect(await screen.findByText('Không có khoản chi trả')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Ghi đã trả/ })).not.toBeInTheDocument()
})

test('creating a period shows the server rule that refused it', async () => {
  render(<SettlementList basePath="/accountant" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Tạo kỳ' }))
  fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-11-01' } })
  fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2026-11-30' } })
  fireEvent.click(screen.getAllByRole('button', { name: 'Tạo kỳ' })[1])
  expect(await screen.findByRole('alert')).toHaveTextContent('Còn phiếu trước ngày bắt đầu kỳ.')
  expect(screen.getByText('Chưa có kỳ quyết toán nào. Bấm “Tạo kỳ”.')).toBeInTheDocument()
})

test('the slip shows the VietQR for the payable amount', async () => {
  render(<SettlementSlip periodId="p1" lineId="l1" backHref="/manager/settlements/p1" />)
  expect(await screen.findByRole('img', { name: 'Mã VietQR chuyển 1.000.000 đ' })).toHaveAttribute('src', 'data:image/png;base64,AAA')
  expect(screen.getByText('Số tài khoản: 8600201001234')).toBeInTheDocument()
  expect(screen.getByText(/Thực lĩnh:/)).toHaveTextContent('Thực lĩnh: 1.000.000 đ')
})

test('a household without bank details gets a cash slip with no QR', async () => {
  render(<SettlementSlip periodId="p1" lineId="l2" backHref="/manager/settlements/p1" />)
  expect(await screen.findByText('Trả tiền mặt')).toBeInTheDocument()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(within(screen.getByLabelText('Thanh toán')).queryByText(/Ngân hàng/)).not.toBeInTheDocument()
})
