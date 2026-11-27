// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React, { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { PesticidePicker, type PesticideChange } from '@/components/features/pesticide/PesticidePicker'

jest.mock('idb-keyval', () => ({ get: jest.fn().mockResolvedValue(undefined), set: jest.fn().mockResolvedValue(undefined) }))

const rows = [
  { id: 'p1', trade_name: 'Abamec', active_ingredient: 'abamectin', group: 'CHEMICAL', targets: ['rầy'], default_phi_days: 7, floor_days: 10, label: null, needs_label_check: false },
  { id: 'p2', trade_name: 'Neem Bio', active_ingredient: 'azadirachtin', group: 'BOTANICAL', targets: [], default_phi_days: 3, floor_days: 3, label: null, needs_label_check: true },
]

function Harness({ spy }: { spy?: (v: PesticideChange) => void }) {
  const [v, setV] = useState<PesticideChange>({ productId: null, customName: '', days: null, floorDays: 14 })
  return <PesticidePicker value={v} onChange={next => { setV(next); spy?.(next) }} />
}

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: rows }) }) as unknown as typeof fetch
})

test('choosing a product fills the days with its floor', async () => {
  render(<Harness />)
  fireEvent.click(await screen.findByRole('button', { name: /Abamec/ }))
  expect(screen.getByLabelText('Số ngày cách ly')).toHaveValue(10)
})

test('days below the floor show the error', async () => {
  const spy = jest.fn()
  render(<Harness spy={spy} />)
  fireEvent.click(await screen.findByRole('button', { name: /Abamec/ }))
  fireEvent.change(screen.getByLabelText('Số ngày cách ly'), { target: { value: '4' } })
  expect(screen.getByRole('alert')).toHaveTextContent('Thời gian cách ly không được thấp hơn 10 ngày')
  expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ productId: 'p1', days: 4, floorDays: 10 }))
})

test('"Thuốc khác" locks the floor at 14 and asks for a name', async () => {
  const spy = jest.fn()
  render(<Harness spy={spy} />)
  fireEvent.click(await screen.findByRole('button', { name: /Thuốc khác/ }))
  expect(screen.getByLabelText('Tên thuốc')).toBeInTheDocument()
  expect(screen.getByLabelText('Số ngày cách ly')).toHaveValue(14)
  fireEvent.change(screen.getByLabelText('Số ngày cách ly'), { target: { value: '7' } })
  expect(screen.getByRole('alert')).toHaveTextContent('Thời gian cách ly không được thấp hơn 14 ngày')
  expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ productId: null, floorDays: 14 }))
})

test('needs_label_check shows the default-floor note', async () => {
  render(<Harness />)
  await screen.findByRole('button', { name: /Neem Bio/ })
  expect(screen.getAllByText('Mức sàn mặc định — cần đối chiếu nhãn thực tế')).toHaveLength(1)
})

test('the search box filters the list', async () => {
  render(<Harness />)
  await screen.findByRole('button', { name: /Abamec/ })
  fireEvent.change(screen.getByLabelText('Tìm thuốc'), { target: { value: 'neem' } })
  await waitFor(() => expect(screen.queryByRole('button', { name: /Abamec/ })).not.toBeInTheDocument())
  expect(screen.getByRole('button', { name: /Neem Bio/ })).toBeInTheDocument()
})
