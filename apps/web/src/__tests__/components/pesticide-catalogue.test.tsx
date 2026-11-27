// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { PesticideCatalogue } from '@/components/features/pesticide/PesticideCatalogue'

const row = { id: 'p1', trade_name: 'Abamec', active_ingredient: 'abamectin', group: 'CHEMICAL', targets: [], default_phi_days: 14, floor_days: 14, label: null, needs_label_check: true }
let put: any
let putStatus = 200
beforeEach(() => {
  put = undefined; putStatus = 200
  global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') { put = JSON.parse(String(init.body)); return { ok: putStatus < 400, status: putStatus, json: async () => (putStatus < 400 ? { data: row } : { error: { code: 'VALIDATION_ERROR', message: 'Ghi chú nhãn là bắt buộc.' } }) } }
    return { ok: true, status: 200, json: async () => ({ data: [row] }) }
  }) as unknown as typeof fetch
})

const openDialog = async () => {
  render(<PesticideCatalogue />)
  fireEvent.click(await screen.findByRole('button', { name: 'Cập nhật theo nhãn Abamec' }))
}

test('shows the label hint and the dialog sentence', async () => {
  await openDialog()
  expect(screen.getAllByText('Mức sàn mặc định — cần đối chiếu nhãn thực tế').length).toBeGreaterThan(0)
  expect(screen.getByText('Nhập đúng số ngày cách ly ghi trên nhãn của lô thuốc đang có ở kho HTX.')).toBeInTheDocument()
})

test('below the default it requires a note, then asks to confirm, then saves', async () => {
  await openDialog()
  fireEvent.change(screen.getByLabelText(/Số ngày cách ly/), { target: { value: '7' } })
  fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
  expect(screen.getByText('Nhập số lô hoặc mô tả nhãn khi thấp hơn mức mặc định.')).toBeInTheDocument()
  expect(put).toBeUndefined()
  fireEvent.change(screen.getByLabelText(/Ghi chú nhãn/), { target: { value: 'Lô 123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
  expect(screen.getByText('Thấp hơn mức sàn mặc định 14 ngày. Xác nhận đúng như nhãn?')).toBeInTheDocument()
  expect(put).toBeUndefined()
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đúng như nhãn' }))
  await waitFor(() => expect(put).toEqual({ label_phi_days: 7, label_note: 'Lô 123' }))
})

test('at or above the default saves directly without a note', async () => {
  await openDialog()
  fireEvent.change(screen.getByLabelText(/Số ngày cách ly/), { target: { value: '21' } })
  fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
  await waitFor(() => expect(put).toEqual({ label_phi_days: 21 }))
})

test('a 422 from the API shows inline', async () => {
  putStatus = 422
  await openDialog()
  fireEvent.change(screen.getByLabelText(/Số ngày cách ly/), { target: { value: '30' } })
  fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
  expect(await screen.findByText('Ghi chú nhãn là bắt buộc.')).toBeInTheDocument()
})
