// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { LotFromBatchesPanel } from '@/components/features/lots/LotFromBatchesPanel'

const row = (id: string, batch: string, remaining: number, outOfBand = false) => ({
  output_id: id, batch_id: 'b-' + id, batch_code: batch, processed_on: '2026-11-28', grade: 'DINH', kg: remaining, remaining_kg: remaining,
  recovery_ratio: 4.8, out_of_band: outOfBand,
})

let stock: unknown[]
let calls: { url: string; method: string; body: any }[]
let createResponse: () => { ok: boolean; status: number; json: () => Promise<unknown> }

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data })

beforeEach(() => {
  stock = [row('o1', 'TC-MS-20261128-01', 19), row('o2', 'TC-MS-20261128-02', 30.5, true)]
  calls = []
  createResponse = () => ({ ok: true, status: 201, json: async () => ({ data: { lot_code: 'TC-CHE-20261128-001', dry_grade: 'DINH' } }) })
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ url, method, body })
    if (url.startsWith('/api/dry-stock?grade=')) return ok({ data: stock })
    if (url === '/api/lots/from-batches' && method === 'POST') return createResponse()
    return { ok: false, status: 404, json: async () => ({}) }
  }) as unknown as typeof fetch
})

const pickGrade = async (value = 'DINH') => {
  fireEvent.change(screen.getByLabelText('Hạng chè khô'), { target: { value } })
  return screen.findByRole('table')
}

test('the stock of a grade appears with each line prefilled to what is left', async () => {
  render(<LotFromBatchesPanel basePath="/officer" />)
  await pickGrade()
  expect(screen.getByLabelText('Kg lấy từ TC-MS-20261128-01')).toHaveValue(19)
  expect(screen.getByLabelText('Kg lấy từ TC-MS-20261128-02')).toHaveValue(30.5)
  expect(screen.getByText('Lệch chuẩn')).toBeInTheDocument()
  expect(calls[0].url).toBe('/api/dry-stock?grade=DINH')
})

test('a grade with no stock says so and offers no lot', async () => {
  stock = []
  render(<LotFromBatchesPanel basePath="/officer" />)
  fireEvent.change(screen.getByLabelText('Hạng chè khô'), { target: { value: 'BOM' } })
  expect(await screen.findByText('Chưa có tồn chè khô hạng Bồm.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Đóng lô' })).not.toBeInTheDocument()
})

test('a lot is created from the kg taken, the packaging is sent, and the success names the lot', async () => {
  render(<LotFromBatchesPanel basePath="/manager" />)
  await pickGrade()
  fireEvent.change(screen.getByLabelText('Kg lấy từ TC-MS-20261128-02'), { target: { value: '10.5' } })
  fireEvent.change(screen.getByLabelText('Cách đóng gói'), { target: { value: 'Túi 500 g' } })
  fireEvent.click(screen.getByRole('button', { name: 'Đóng lô' }))
  expect(await screen.findByText(/Đã đóng lô TC-CHE-20261128-001/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'In tem cho lô này' })).toHaveAttribute('href', '/manager/lots/TC-CHE-20261128-001/labels')
  const post = calls.find(c => c.method === 'POST')!
  expect(post.body).toEqual({
    grade: 'DINH',
    sources: [{ output_id: 'o1', kg: 19 }, { output_id: 'o2', kg: 10.5 }],
    packaging_type: 'Túi 500 g',
  })
})

test('taking more than the line holds is refused before the request', async () => {
  render(<LotFromBatchesPanel basePath="/officer" />)
  await pickGrade()
  fireEvent.change(screen.getByLabelText('Kg lấy từ TC-MS-20261128-01'), { target: { value: '20' } })
  fireEvent.click(screen.getByRole('button', { name: 'Đóng lô' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Kg lấy từ TC-MS-20261128-01 vượt tồn 19,0 kg.')
  expect(calls.some(c => c.method === 'POST')).toBe(false)
})

test('STOCK_CHANGED reloads the table with the fresh stock and says so', async () => {
  createResponse = () => ({
    ok: false, status: 409,
    json: async () => ({ error: { code: 'STOCK_CHANGED', stock: [row('o1', 'TC-MS-20261128-01', 4)] } }),
  })
  render(<LotFromBatchesPanel basePath="/officer" />)
  await pickGrade()
  fireEvent.click(screen.getByRole('button', { name: 'Đóng lô' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Tồn chè khô vừa thay đổi')
  const table = screen.getByRole('table')
  expect(within(table).queryByText('TC-MS-20261128-02')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Kg lấy từ TC-MS-20261128-01')).toHaveValue(4)
})

test('a refused withdrawal shows the server message', async () => {
  createResponse = () => ({
    ok: false, status: 422,
    json: async () => ({ error: { code: 'WITHDRAWAL_NOT_PASSED', message: 'Phiếu cân ngày 28/11 của thửa T-01 còn cách ly đến 03/12.' } }),
  })
  render(<LotFromBatchesPanel basePath="/officer" />)
  await pickGrade()
  fireEvent.click(screen.getByRole('button', { name: 'Đóng lô' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Phiếu cân ngày 28/11 của thửa T-01 còn cách ly đến 03/12.')
})

test('a grade mismatch without a server message shows the text for its code', async () => {
  createResponse = () => ({ ok: false, status: 422, json: async () => ({ error: { code: 'GRADE_MISMATCH' } }) })
  render(<LotFromBatchesPanel basePath="/officer" />)
  await pickGrade()
  fireEvent.click(screen.getByRole('button', { name: 'Đóng lô' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Có dòng tồn không cùng hạng với lô đang đóng.')
})
