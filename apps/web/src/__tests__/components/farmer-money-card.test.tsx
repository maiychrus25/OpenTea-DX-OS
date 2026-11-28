// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { FarmerMoneyCard } from '@/components/features/ledger/FarmerMoneyCard'

const ticket = (id: string, status = 'VALID') => ({ id, weighed_at: '2026-11-28T03:00:00Z', grade_name: 'Loại 1', net_kg: 95, amount_vnd: '1235000', status })
const answer = (body: unknown, ok = true) => {
  global.fetch = jest.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => body })) as unknown as typeof fetch
}

test('shows the balance and at most three tickets, leaving out voided ones', async () => {
  answer({ data: { balance_vnd: '250000', unsettled_tickets: [ticket('v', 'VOIDED'), ticket('a'), ticket('b'), ticket('c'), ticket('d')] } })
  render(<FarmerMoneyCard />)
  expect(await screen.findByText('HTX đang nợ bạn 250.000 đ')).toBeInTheDocument()
  expect(within(screen.getByRole('list', { name: 'Phiếu cân gần nhất' })).getAllByRole('listitem')).toHaveLength(3)
  expect(screen.getByRole('link', { name: /Xem sổ tiền/ })).toHaveAttribute('href', '/farmer/ledger')
})

test('a failed load shows the error and no balance', async () => {
  answer({}, false)
  render(<FarmerMoneyCard />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải dữ liệu')
  expect(screen.queryByText(/Số dư|đang nợ/)).not.toBeInTheDocument()
})
