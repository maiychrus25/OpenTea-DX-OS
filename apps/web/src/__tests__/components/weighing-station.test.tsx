// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { WeighingStation } from '@/components/features/weighing/WeighingStation'

const priceRows = [
  { grade_id: 'g1', grade_name: 'Loại 1', price_vnd_per_kg: 13000, yesterday_vnd_per_kg: 12000 },
  { grade_id: 'g2', grade_name: 'Loại 2', price_vnd_per_kg: null, yesterday_vnd_per_kg: null },
]
const household = { id: 'h1', name: 'Nguyễn Văn A', phone: '0901', parcels: [{ id: 'p1', parcel_code: 'T-01' }, { id: 'p2', parcel_code: 'T-02' }] }
const savedTicket = {
  id: 't1', ticket_no: 'HTX-PC-20261128-001', household_id: 'h1', household_name: 'Nguyễn Văn A', parcel_id: 'p1', parcel_code: 'T-01',
  cycle_id: null, grade_id: 'g1', grade_name: 'Loại 1', weighed_at: '2026-11-28T03:00:00Z', gross_kg: 100, deduction_pct: 5,
  net_kg: 95, price_vnd_per_kg: 13000, amount_vnd: '1235000', status: 'VALID', void_reason: null, settlement_id: null,
}

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data })

let posts: any[]
let voids: any[]
let tickets: unknown[]
let postResponse: () => unknown

beforeEach(() => {
  posts = []
  voids = []
  tickets = []
  postResponse = () => ({ ok: true, status: 201, json: async () => ({ data: savedTicket }) })
  window.open = jest.fn() as unknown as typeof window.open
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    if (url === '/api/leaf-prices/today') return ok({ data: { date: '2026-11-28', published_at: null, prices: priceRows } })
    if (url.startsWith('/api/households?q=')) return ok({ data: [household] })
    if (url === '/api/parcels/p1/withdrawal-status') return ok({ data: { blocked: false, safe_from: null } })
    if (url === '/api/parcels/p2/withdrawal-status') return ok({ data: { blocked: true, safe_from: '2026-12-03' } })
    if (url === '/api/leaf-tickets' && method === 'POST') { posts.push(body); return postResponse() }
    if (url.startsWith('/api/leaf-tickets?date=')) return ok({ data: tickets, next_cursor: null, totals: { net_kg: 95, amount_vnd: '1235000' } })
    if (url.endsWith('/void')) { voids.push(body); return ok({ data: { ...savedTicket, status: 'VOIDED' } }) }
    return { ok: false, status: 404, json: async () => ({}) }
  }) as unknown as typeof fetch
})

/** Searches the household and picks the first hit. */
async function chooseHousehold() {
  fireEvent.change(screen.getByLabelText('Hộ'), { target: { value: 'Nguyễn' } })
  fireEvent.click(await screen.findByRole('button', { name: /Nguyễn Văn A/ }))
}

const saveButton = () => screen.getByRole('button', { name: 'Lưu phiếu' })

test('a parcel inside its withdrawal shows red, explains why and locks save', async () => {
  render(<WeighingStation />)
  await chooseHousehold()
  fireEvent.click(await screen.findByRole('button', { name: /T-02/ }))
  expect(await screen.findByText('Còn cách ly đến 03/12')).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Nương T-02 còn trong thời gian cách ly đến 03/12/2026. Không được cân búp thương phẩm.')
  fireEvent.click(screen.getByRole('button', { name: /Loại 1/ }))
  fireEvent.change(screen.getByLabelText('Kg cân'), { target: { value: '100' } })
  expect(saveButton()).toBeDisabled()
  expect(posts).toHaveLength(0)
})

test('a 409 from the server shows its message and turns the parcel red', async () => {
  postResponse = () => ({
    ok: false, status: 409,
    json: async () => ({ error: { code: 'PARCEL_IN_WITHDRAWAL', message: 'Nương T-01 còn trong thời gian cách ly đến 03/12/2026. Không được cân búp thương phẩm.', safe_from: '2026-12-03' } }),
  })
  render(<WeighingStation />)
  await chooseHousehold()
  fireEvent.click(await screen.findByRole('button', { name: /T-01/ }))
  await screen.findByText('Đã qua cách ly')
  fireEvent.click(screen.getByRole('button', { name: /Loại 1/ }))
  fireEvent.change(screen.getByLabelText('Kg cân'), { target: { value: '100' } })
  fireEvent.click(saveButton())
  expect(await screen.findByRole('alert')).toHaveTextContent('Nương T-01 còn trong thời gian cách ly đến 03/12/2026.')
  expect(within(screen.getByRole('button', { name: /T-01/ })).getByText('Còn cách ly đến 03/12')).toBeInTheDocument()
  expect(saveButton()).toBeDisabled()
})

test('net kg and the amount follow the rounding rule as the numbers change; a grade without a price cannot be picked', async () => {
  render(<WeighingStation />)
  await chooseHousehold()
  fireEvent.click(await screen.findByRole('button', { name: /T-01/ }))
  await screen.findByText('Đã qua cách ly')
  expect(screen.getByRole('button', { name: /Loại 2/ })).toBeDisabled()
  expect(screen.getByText('Chưa công bố giá')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Loại 1/ }))
  fireEvent.change(screen.getByLabelText('Kg cân'), { target: { value: '100' } })
  fireEvent.click(screen.getByRole('button', { name: '5%' }))
  const preview = screen.getByText('Kg tịnh').closest('dl') as HTMLElement
  expect(preview).toHaveTextContent('95,0 kg')
  expect(preview).toHaveTextContent('1.235.000 đ')
  fireEvent.change(screen.getByLabelText('Kg cân'), { target: { value: '12.3' } })
  fireEvent.change(screen.getByLabelText('Trừ nước mưa và tạp chất (%)'), { target: { value: '7.5' } })
  expect(preview).toHaveTextContent('11,4 kg')
  expect(preview).toHaveTextContent('148.200 đ')
})

test('void requires a reason before it calls the server', async () => {
  tickets = [savedTicket]
  render(<WeighingStation />)
  fireEvent.click(await screen.findByRole('button', { name: 'Huỷ phiếu HTX-PC-20261128-001' }))
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận huỷ' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Nhập lý do huỷ từ 3 đến 200 ký tự.')
  expect(voids).toHaveLength(0)
  fireEvent.change(screen.getByLabelText('Lý do huỷ'), { target: { value: 'Nhập sai số kg' } })
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận huỷ' }))
  await waitFor(() => expect(voids).toEqual([{ reason: 'Nhập sai số kg' }]))
})

test('a saved ticket opens its receipt and the form resets for the next household', async () => {
  render(<WeighingStation />)
  await chooseHousehold()
  fireEvent.click(await screen.findByRole('button', { name: /T-01/ }))
  await screen.findByText('Đã qua cách ly')
  fireEvent.click(screen.getByRole('button', { name: /Loại 1/ }))
  fireEvent.change(screen.getByLabelText('Kg cân'), { target: { value: '100' } })
  fireEvent.click(screen.getByRole('button', { name: '5%' }))
  fireEvent.click(saveButton())
  await waitFor(() => expect(window.open).toHaveBeenCalledWith('/accountant/weighing/t1/print', '_blank'))
  expect(posts[0]).toMatchObject({ household_id: 'h1', parcel_id: 'p1', grade_id: 'g1', gross_kg: 100, deduction_pct: 5 })
  expect(posts[0].client_id).toMatch(/^[0-9a-f-]{36}$/)
  expect(screen.getByLabelText('Kg cân')).toHaveValue(null)
  expect(screen.getByLabelText('Hộ')).toHaveValue('')
  expect(screen.queryByText('Nguyễn Văn A', { exact: false })).not.toBeInTheDocument()
})
