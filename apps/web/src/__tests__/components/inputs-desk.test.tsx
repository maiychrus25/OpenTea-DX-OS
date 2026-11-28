// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { InputsPanel } from '@/components/features/ledger/InputsPanel'

const items = [
  { id: 'i1', name: 'Phân NPK', unit: 'kg', unit_price_vnd: 12000, kind: 'FERTILIZER', pesticide_product_id: null, active: true },
]
const household = { id: 'h1', name: 'Nguyễn Văn A', phone: '0901', parcels: [] }
const advance = {
  id: 'a1', advance_no: 'HTX-VT-20261128-001', household_id: 'h1', household_name: 'Nguyễn Văn A', item_id: 'i1', item_name: 'Phân NPK',
  unit: 'kg', quantity: 2.5, unit_price_vnd: 12000, amount_vnd: '30000', advanced_on: '2026-11-28', status: 'VALID', void_reason: null, settlement_id: null,
}

let calls: { url: string; method: string; body: any }[]
let advanceList: unknown[]
let savedBank: unknown

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data })

beforeEach(() => {
  calls = []
  advanceList = []
  savedBank = null
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ url, method, body })
    if (url === '/api/input-items' && method === 'GET') return ok({ data: items })
    if (url.startsWith('/api/households?q=')) return ok({ data: [household] })
    if (url === '/api/banks') return ok({ data: [{ bin: '970405', name: 'Agribank' }] })
    if (url === '/api/input-items' && method === 'POST') return ok({ data: { ...items[0], id: 'i2' } })
    if (url === '/api/input-advances' && method === 'POST') return ok({ data: advance })
    if (url.startsWith('/api/input-advances?from=')) return ok({ data: advanceList, next_cursor: null, totals: { amount_vnd: '30000' } })
    if (url.endsWith('/void')) return ok({ data: { ...advance, status: 'VOIDED' } })
    if (url.startsWith('/api/pesticides')) return ok({ data: [] })
    if (url === '/api/households/h1/bank' && method === 'GET') return ok({ data: savedBank })
    if (url === '/api/households/h1/bank' && method === 'PUT') return ok({ data: { bank_bin: '970405', bank_name: 'Agribank', account_masked: '********1234', bank_account_name: null } })
    return { ok: false, status: 404, json: async () => ({}) }
  }) as unknown as typeof fetch
})

const chooseHousehold = async () => {
  fireEvent.change(screen.getAllByLabelText('Hộ')[0], { target: { value: 'Nguyễn' } })
  fireEvent.click(await screen.findByRole('button', { name: /Nguyễn Văn A/ }))
}

test('the advance amount updates live and the advance is posted with the item and quantity', async () => {
  render(<InputsPanel />)
  await screen.findByRole('option', { name: /Phân NPK/ })
  await chooseHousehold()
  fireEvent.change(screen.getByLabelText('Vật tư'), { target: { value: 'i1' } })
  fireEvent.change(screen.getByLabelText(/Số lượng/), { target: { value: '2.5' } })
  expect(screen.getByText('Thành tiền').closest('dl')).toHaveTextContent('30.000 đ')
  fireEvent.click(screen.getByRole('button', { name: 'Ghi phiếu ứng' }))
  await waitFor(() => expect(calls.some(c => c.url === '/api/input-advances' && c.method === 'POST')).toBe(true))
  const post = calls.find(c => c.url === '/api/input-advances' && c.method === 'POST')!
  expect(post.body).toEqual({ household_id: 'h1', item_id: 'i1', quantity: 2.5, client_id: expect.stringMatching(/^[0-9a-f-]{36}$/) })
})

test('a zero quantity is refused and the button stays locked', async () => {
  render(<InputsPanel />)
  await screen.findByRole('option', { name: /Phân NPK/ })
  await chooseHousehold()
  fireEvent.change(screen.getByLabelText('Vật tư'), { target: { value: 'i1' } })
  fireEvent.change(screen.getByLabelText(/Số lượng/), { target: { value: '0' } })
  expect(screen.getByRole('alert')).toHaveTextContent('Nhập số lượng lớn hơn 0')
  expect(screen.getByRole('button', { name: 'Ghi phiếu ứng' })).toBeDisabled()
})

test('voiding an advance needs a reason before the server is called', async () => {
  advanceList = [advance]
  render(<InputsPanel />)
  fireEvent.click(await screen.findByRole('button', { name: 'Huỷ phiếu HTX-VT-20261128-001' }))
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận huỷ' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Nhập lý do huỷ từ 3 đến 200 ký tự.')
  expect(calls.some(c => c.url.endsWith('/void'))).toBe(false)
  fireEvent.change(screen.getByLabelText('Lý do huỷ'), { target: { value: 'Ghi nhầm hộ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận huỷ' }))
  await waitFor(() => expect(calls.find(c => c.url.endsWith('/void'))?.body).toEqual({ reason: 'Ghi nhầm hộ' }))
})

test('the bank form refuses a non-numeric account and saves a valid one, showing only the masked number', async () => {
  render(<InputsPanel />)
  await screen.findByRole('option', { name: /Phân NPK/ })
  fireEvent.change(screen.getAllByLabelText('Hộ')[1], { target: { value: 'Nguyễn' } })
  fireEvent.click(await screen.findByRole('button', { name: /Nguyễn Văn A/ }))
  await screen.findByRole('option', { name: 'Agribank' })
  fireEvent.change(screen.getByLabelText('Ngân hàng'), { target: { value: '970405' } })
  fireEvent.change(screen.getByLabelText('Số tài khoản'), { target: { value: 'abc' } })
  fireEvent.click(screen.getByRole('button', { name: 'Lưu tài khoản' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Số tài khoản chỉ gồm 6 đến 19 chữ số.')
  expect(calls.some(c => c.method === 'PUT')).toBe(false)
  fireEvent.change(screen.getByLabelText('Số tài khoản'), { target: { value: '8600201001234' } })
  fireEvent.click(screen.getByRole('button', { name: 'Lưu tài khoản' }))
  expect(await screen.findByText('Đã lưu: Agribank · ********1234')).toBeInTheDocument()
  expect(calls.find(c => c.method === 'PUT')?.body).toEqual({ bank_bin: '970405', bank_account: '8600201001234', bank_account_name: '' })
})

test('an item needs a name, and a pesticide item needs a catalogue product', async () => {
  render(<InputsPanel />)
  await screen.findByRole('button', { name: 'Sửa Phân NPK' })
  fireEvent.click(screen.getByRole('button', { name: 'Thêm vật tư' }))
  fireEvent.click(screen.getByRole('button', { name: 'Lưu vật tư' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Nhập tên vật tư')
  fireEvent.change(screen.getByLabelText('Loại'), { target: { value: 'PESTICIDE' } })
  fireEvent.change(screen.getByLabelText('Tên vật tư'), { target: { value: 'Thuốc A' } })
  fireEvent.change(screen.getByLabelText('Đơn vị'), { target: { value: 'chai' } })
  fireEvent.change(screen.getByLabelText('Đơn giá (đ)'), { target: { value: '50000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Lưu vật tư' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Chọn thuốc trong danh mục thuốc.')
  expect(calls.some(c => c.url === '/api/input-items' && c.method === 'POST')).toBe(false)
})

test('the bank form opens with the saved account in full, and the summary shows only the masked number', async () => {
  savedBank = { bank_bin: '970405', bank_name: 'Agribank', bank_account: '8600201001234', account_masked: '********1234', bank_account_name: 'NGUYEN VAN A' }
  render(<InputsPanel />)
  await screen.findByRole('option', { name: /Phân NPK/ })
  fireEvent.change(screen.getAllByLabelText('Hộ')[1], { target: { value: 'Nguyễn' } })
  fireEvent.click(await screen.findByRole('button', { name: /Nguyễn Văn A/ }))
  expect(await screen.findByText('Đã lưu: Agribank · ********1234')).toBeInTheDocument()
  expect(screen.getByLabelText('Ngân hàng')).toHaveValue('970405')
  expect(screen.getByLabelText('Số tài khoản')).toHaveValue('8600201001234')
  expect(screen.getByLabelText('Tên chủ tài khoản')).toHaveValue('NGUYEN VAN A')
  expect(screen.getByRole('button', { name: 'Lưu tài khoản' })).toBeEnabled()
})

test('a household with no saved bank opens an empty form', async () => {
  render(<InputsPanel />)
  await screen.findByRole('option', { name: /Phân NPK/ })
  fireEvent.change(screen.getAllByLabelText('Hộ')[1], { target: { value: 'Nguyễn' } })
  fireEvent.click(await screen.findByRole('button', { name: /Nguyễn Văn A/ }))
  await screen.findByRole('option', { name: 'Agribank' })
  expect(screen.getByLabelText('Ngân hàng')).toHaveValue('')
  expect(screen.getByLabelText('Số tài khoản')).toHaveValue('')
  expect(screen.getByLabelText('Tên chủ tài khoản')).toHaveValue('')
  expect(screen.queryByText(/Đã lưu:/)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Lưu tài khoản' })).toBeEnabled()
})
