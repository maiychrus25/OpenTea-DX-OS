// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { LeafPricesPanel } from '@/components/features/weighing/LeafPricesPanel'

const grade = { id: 'g1', name: 'Loại 1', sort_order: 0, active: true }
const todayUnpublished = { date: '2026-11-28', published_at: null, prices: [{ grade_id: 'g1', grade_name: 'Loại 1', price_vnd_per_kg: null, yesterday_vnd_per_kg: 14000 }] }
const published = { ...todayUnpublished, published_at: '2026-11-28T07:05:00Z', prices: [{ ...todayUnpublished.prices[0], price_vnd_per_kg: 14000 }] }

let calls: { url: string; method: string; body: any }[]
let gradeResponse: () => { ok: boolean; status: number; json: () => Promise<unknown> }

beforeEach(() => {
  calls = []
  gradeResponse = () => ({ ok: true, status: 200, json: async () => ({ data: { ...grade } }) })
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ url, method, body })
    if (url === '/api/leaf-prices/today' && method === 'GET') return { ok: true, status: 200, json: async () => ({ data: todayUnpublished }) }
    if (url === '/api/leaf-prices/today' && method === 'PUT') return { ok: true, status: 200, json: async () => ({ data: published }) }
    if (url === '/api/leaf-grades' && method === 'GET') return { ok: true, status: 200, json: async () => ({ data: [grade] }) }
    if (url.startsWith('/api/leaf-grades')) return gradeResponse()
    return { ok: false, status: 404, json: async () => ({}) }
  }) as unknown as typeof fetch
})

const puts = (url: string) => calls.filter(c => c.url === url && c.method === 'PUT')

test('the price box starts from yesterday when today is not published', async () => {
  render(<LeafPricesPanel />)
  expect(await screen.findByLabelText(/Giá hôm nay/)).toHaveValue(14000)
  expect(screen.getByText('Hôm qua: 14.000 đ/kg')).toBeInTheDocument()
})

test('a single click publishes every grade price and shows the time', async () => {
  render(<LeafPricesPanel />)
  await screen.findByLabelText(/Giá hôm nay/)
  fireEvent.click(screen.getByRole('button', { name: 'Công bố giá hôm nay' }))
  await waitFor(() => expect(puts('/api/leaf-prices/today')).toHaveLength(1))
  expect(puts('/api/leaf-prices/today')[0].body).toEqual({ prices: [{ grade_id: 'g1', price_vnd_per_kg: 14000 }] })
  expect(await screen.findByText(/Đã công bố lúc 14:05/)).toBeInTheDocument()
})

test('an empty or zero price stops publishing before any request', async () => {
  render(<LeafPricesPanel />)
  const input = await screen.findByLabelText(/Giá hôm nay/)
  fireEvent.change(input, { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Công bố giá hôm nay' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Nhập giá hợp lệ')
  fireEvent.change(input, { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: 'Công bố giá hôm nay' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Loại 1')
  expect(puts('/api/leaf-prices/today')).toHaveLength(0)
})

test('a grade can be added', async () => {
  render(<LeafPricesPanel />)
  await screen.findByLabelText(/Giá hôm nay/)
  fireEvent.change(screen.getByLabelText('Tên phẩm cấp mới'), { target: { value: 'Loại 4' } })
  fireEvent.click(screen.getByRole('button', { name: 'Thêm phẩm cấp' }))
  await waitFor(() => expect(calls.some(c => c.url === '/api/leaf-grades' && c.method === 'POST')).toBe(true))
  expect(calls.find(c => c.method === 'POST')?.body).toEqual({ name: 'Loại 4' })
})

test('a grade can be renamed', async () => {
  render(<LeafPricesPanel />)
  await screen.findByLabelText(/Giá hôm nay/)
  fireEvent.click(screen.getByRole('button', { name: 'Đổi tên Loại 1' }))
  fireEvent.change(screen.getByLabelText('Tên phẩm cấp'), { target: { value: 'Loại 2' } })
  fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
  await waitFor(() => expect(puts('/api/leaf-grades/g1')).toHaveLength(1))
  expect(puts('/api/leaf-grades/g1')[0].body).toEqual({ name: 'Loại 2' })
})

test('a grade can be hidden and shown again', async () => {
  render(<LeafPricesPanel />)
  await screen.findByLabelText(/Giá hôm nay/)
  fireEvent.click(screen.getByRole('button', { name: 'Ẩn Loại 1' }))
  await waitFor(() => expect(puts('/api/leaf-grades/g1')).toHaveLength(1))
  expect(puts('/api/leaf-grades/g1')[0].body).toEqual({ active: false })
})
