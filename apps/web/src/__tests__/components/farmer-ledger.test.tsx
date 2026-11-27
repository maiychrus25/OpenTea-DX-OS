// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { FarmerLedger, balanceText } from '@/components/features/ledger/FarmerLedger'

const ticket = {
  id: 't1', ticket_no: 'HTX-PC-20261128-001', household_id: 'h1', household_name: 'Nguyễn Văn A', parcel_id: 'p1', parcel_code: 'T-01',
  cycle_id: null, grade_id: 'g1', grade_name: 'Loại 1', weighed_at: '2026-11-28T03:00:00Z', gross_kg: 100, deduction_pct: 5,
  net_kg: 95, price_vnd_per_kg: 13000, amount_vnd: '1235000', status: 'VALID', void_reason: null, settlement_id: null,
}
const advance = {
  id: 'a1', advance_no: 'HTX-VT-20261128-001', household_id: 'h1', household_name: 'Nguyễn Văn A', item_id: 'i1', item_name: 'Phân NPK',
  unit: 'kg', quantity: 2.5, unit_price_vnd: 12000, amount_vnd: '30000', advanced_on: '2026-11-28', status: 'VALID', void_reason: null, settlement_id: null,
}
const line = {
  id: 'l1', period_id: 'p1', period_code: 'HTX-QT-20261101-20261130', date_from: '2026-11-01', date_to: '2026-11-30',
  household_id: 'h1', household_name: 'Nguyễn Văn A', leaf_net_kg: 95, leaf_amount_vnd: '1235000', advances_vnd: '0',
  debt_in_vnd: '0', payable_vnd: '1235000', debt_out_vnd: '0', paid_at: null, payment_method: null, payment_ref: null, has_bank_account: true,
}
const oneHousehold = [{ household_id: 'h1', household_name: 'Nguyễn Văn A', balance_vnd: '250000' }]

let mine: unknown
let failing: boolean

beforeEach(() => {
  mine = { balance_vnd: '250000', households: oneHousehold, entries: [], unsettled_tickets: [ticket], unsettled_advances: [advance], lines: [line] }
  failing = false
  global.fetch = jest.fn(async () => (failing
    ? { ok: false, status: 500, json: async () => ({}) }
    : { ok: true, status: 200, json: async () => ({ data: mine }) })) as unknown as typeof fetch
})

test('the balance sentence says who owes whom, and zero reads "Số dư 0 đ"', () => {
  expect(balanceText('250000')).toBe('HTX đang nợ bạn 250.000 đ')
  expect(balanceText('-120000')).toBe('Bạn đang nợ HTX 120.000 đ')
  expect(balanceText('0')).toBe('Số dư 0 đ')
})

test('the page shows the balance and opens on the tickets tab', async () => {
  render(<FarmerLedger />)
  expect(await screen.findByText('HTX đang nợ bạn 250.000 đ')).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Phiếu cân' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByText('HTX-PC-20261128-001')).toBeInTheDocument()
})

test('the tabs switch between tickets, advances and settlements; the slip link points at the farmer slip', async () => {
  render(<FarmerLedger />)
  await screen.findByText('HTX-PC-20261128-001')
  fireEvent.click(screen.getByRole('tab', { name: 'Vật tư ứng' }))
  expect(screen.getByText('HTX-VT-20261128-001')).toBeInTheDocument()
  expect(screen.queryByText('HTX-PC-20261128-001')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'Quyết toán' }))
  expect(screen.getByRole('link', { name: 'Xem phiếu' })).toHaveAttribute('href', '/farmer/settlements/p1/slip/l1')
  expect(screen.getByText('Thực lĩnh 1.235.000 đ · Chưa trả')).toBeInTheDocument()
})

test('the arrow keys move between tabs', async () => {
  render(<FarmerLedger />)
  const tickets = await screen.findByRole('tab', { name: 'Phiếu cân' })
  fireEvent.keyDown(tickets, { key: 'ArrowRight' })
  expect(screen.getByRole('tab', { name: 'Vật tư ứng' })).toHaveAttribute('aria-selected', 'true')
  fireEvent.keyDown(screen.getByRole('tab', { name: 'Vật tư ứng' }), { key: 'ArrowLeft' })
  expect(screen.getByRole('tab', { name: 'Phiếu cân' })).toHaveAttribute('aria-selected', 'true')
})

test('a farmer who owes the HTX sees the amount with "Bạn đang nợ HTX"', async () => {
  mine = { ...(mine as object), balance_vnd: '-120000' }
  render(<FarmerLedger />)
  expect(await screen.findByText('Bạn đang nợ HTX 120.000 đ')).toBeInTheDocument()
})

test('a zero balance shows "Số dư 0 đ"', async () => {
  mine = { ...(mine as object), balance_vnd: '0' }
  render(<FarmerLedger />)
  expect(await screen.findByText('Số dư 0 đ')).toBeInTheDocument()
})

test('each tab has an empty state when nothing is waiting', async () => {
  mine = { balance_vnd: '0', households: [], entries: [], unsettled_tickets: [], unsettled_advances: [], lines: [] }
  render(<FarmerLedger />)
  expect(await screen.findByText('Chưa có phiếu cân nào chờ quyết toán.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'Vật tư ứng' }))
  expect(screen.getByText('Chưa có vật tư ứng nào chờ quyết toán.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'Quyết toán' }))
  expect(screen.getByText('Chưa có kỳ quyết toán nào.')).toBeInTheDocument()
})

test('a farmer with two households sees one balance row per household under the total', async () => {
  mine = { ...(mine as object), balance_vnd: '130000', households: [
    { household_id: 'h1', household_name: 'Nguyễn Văn A', balance_vnd: '250000' },
    { household_id: 'h2', household_name: 'Trần Thị B', balance_vnd: '-120000' },
  ] }
  render(<FarmerLedger />)
  const rows = within(await screen.findByRole('list', { name: 'Số dư từng hộ' })).getAllByRole('listitem')
  expect(rows).toHaveLength(2)
  expect(rows[0]).toHaveTextContent('Nguyễn Văn A: HTX đang nợ bạn 250.000 đ')
  expect(rows[1]).toHaveTextContent('Trần Thị B: Bạn đang nợ HTX 120.000 đ')
})

test('a single household gets no extra balance rows', async () => {
  render(<FarmerLedger />)
  await screen.findByText('HTX đang nợ bạn 250.000 đ')
  expect(screen.queryByRole('list', { name: 'Số dư từng hộ' })).not.toBeInTheDocument()
})

test('each settlement line shows its period code, and the slip link uses period_id', async () => {
  render(<FarmerLedger />)
  fireEvent.click(await screen.findByRole('tab', { name: 'Quyết toán' }))
  expect(screen.getByText(/Kỳ HTX-QT-20261101-20261130/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Xem phiếu' })).toHaveAttribute('href', '/farmer/settlements/p1/slip/l1')
})

test('a failed load shows the error and no balance', async () => {
  failing = true
  render(<FarmerLedger />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải dữ liệu')
  expect(screen.queryByText(/Số dư/)).not.toBeInTheDocument()
})
