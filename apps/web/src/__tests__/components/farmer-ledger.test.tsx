// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { render, screen, within } from '@testing-library/react'
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

test('the page shows the balance and the totals of what is not settled', async () => {
  render(<FarmerLedger />)
  expect(await screen.findByText('HTX đang nợ bạn 250.000 đ')).toBeInTheDocument()
  const totals = within(screen.getByRole('list', { name: 'Tổng hợp chưa quyết toán và các kỳ' })).getAllByRole('listitem')
  expect(totals.map(t => t.textContent)).toEqual(['Phiếu cân195,0 kg', 'Vật tư ứng130.000 đ', 'Quyết toán1kỳ quyết toán'])
})

test('voided tickets stay listed but are left out of the totals', async () => {
  mine = { ...(mine as object), unsettled_tickets: [ticket, { ...ticket, id: 't2', ticket_no: 'HTX-PC-20261128-002', status: 'VOIDED' }] }
  render(<FarmerLedger />)
  const block = await screen.findByRole('region', { name: 'Phiếu cân' })
  expect(within(block).getByText('Tổng 95,0 kg')).toBeInTheDocument()
  expect(within(block).getByText('HTX-PC-20261128-002')).toBeInTheDocument()
})

test('tickets keep their full identifiers, local date-time, parcel, weight, amount and void status in five columns', async () => {
  mine = { ...(mine as object), unsettled_tickets: [ticket, {
    ...ticket, id: 't2', ticket_no: 'HTX-PC-20261128-002', status: 'VOIDED', void_reason: 'Cân nhầm thửa',
  }] }
  render(<FarmerLedger />)
  const table = await screen.findByRole('table', { name: 'Phiếu cân' })
  expect(within(table).getAllByRole('columnheader').map(cell => cell.textContent))
    .toEqual(['Số phiếu', 'Ngày giờ', 'Thửa', 'Kg', 'Thành tiền'])
  const rows = within(table).getAllByRole('row').slice(1)
  expect(within(rows[0]).getAllByRole('cell').map(cell => cell.textContent))
    .toEqual(['HTX-PC-20261128-001Hợp lệ', '28/11/2026 10:00', 'T-01Loại 1', '95,0Gộp 100,0Trừ 5%', '1.235.000 đ13.000 đ/kg'])
  expect(rows[1]).toHaveTextContent('HTX-PC-20261128-002')
  expect(rows[1]).toHaveTextContent('Đã huỷ')
  expect(rows[1]).toHaveTextContent('Cân nhầm thửa')
  expect(screen.getByRole('button', { name: 'Nghe số dư' })).toBeInTheDocument()
})

test('tickets, advances and settlements show together; the slip link points at the farmer slip', async () => {
  render(<FarmerLedger />)
  await screen.findByText('HTX-PC-20261128-001')
  expect(screen.getByText('HTX-VT-20261128-001')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Xem phiếu' })).toHaveAttribute('href', '/farmer/settlements/p1/slip/l1')
  expect(screen.getByText('Thực lĩnh 1.235.000 đ · Chưa trả')).toBeInTheDocument()
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

test('each block has an empty state when nothing is waiting', async () => {
  mine = { balance_vnd: '0', households: [], entries: [], unsettled_tickets: [], unsettled_advances: [], lines: [] }
  render(<FarmerLedger />)
  expect(await screen.findByText('Chưa có phiếu cân nào chờ quyết toán.')).toBeInTheDocument()
  expect(screen.getByText('Chưa có vật tư ứng nào chờ quyết toán.')).toBeInTheDocument()
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
  expect(await screen.findByText(/Kỳ HTX-QT-20261101-20261130/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Xem phiếu' })).toHaveAttribute('href', '/farmer/settlements/p1/slip/l1')
})

test('a failed load shows the error and no balance', async () => {
  failing = true
  render(<FarmerLedger />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải dữ liệu')
  expect(screen.queryByText(/Số dư/)).not.toBeInTheDocument()
})

test('the ledger history names each row and signs its amount', async () => {
  mine = { ...(mine as object), entries: [
    { id: 'e1', entry_type: 'LEAF_CREDIT', amount_vnd: '1235000', created_at: '2026-11-28T03:00:00Z', note: null },
    { id: 'e2', entry_type: 'INPUT_DEBIT', amount_vnd: '-30000', created_at: '2026-11-27T03:00:00Z', note: 'Phân NPK' },
  ] }
  render(<FarmerLedger />)
  const rows = within(await screen.findByRole('list', { name: 'Lịch sử ghi sổ' })).getAllByRole('listitem')
  expect(rows.map(r => r.textContent)).toEqual(['28/11/2026Tiền búp+1.235.000 đ', '27/11/2026Trừ vật tưPhân NPK−30.000 đ'])
})

test('a ticket names its flush when it has one', async () => {
  mine = { ...(mine as object), unsettled_tickets: [{ ...ticket, cycle_season: 'Lứa 3/2026' }] }
  render(<FarmerLedger />)
  expect(within(await screen.findByRole('table', { name: 'Phiếu cân' })).getByText('Lứa 3/2026')).toBeInTheDocument()
})
