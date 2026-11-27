// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ProcessingList } from '@/components/features/processing/ProcessingList'

const batch = {
  id: 'b1', batch_code: 'TC-MS-20261128-01', processed_on: '2026-11-28', status: 'OPEN', master_name: 'Ông A', shift: 'Sáng', notes: null,
  ticket_count: 2, fresh_kg: 190, dry_kg: 38, recovery_ratio: 5, out_of_band: false, deviation_note: null,
  created_at: '2026-11-28T01:00:00Z', finished_at: null, cancel_reason: null,
}
const lateBatch = { ...batch, id: 'b2', batch_code: 'TC-MS-20261128-02', status: 'FINISHED', out_of_band: true, recovery_ratio: 4.2, fresh_kg: 210, dry_kg: 50 }

let calls: { url: string; method: string; body: any }[]
let listResponse: () => { ok: boolean; status: number; json: () => Promise<unknown> }
let createResponse: () => { ok: boolean; status: number; json: () => Promise<unknown> }

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data })

beforeEach(() => {
  calls = []
  listResponse = () => ok({ data: [batch, lateBatch] })
  createResponse = () => ({ ok: true, status: 201, json: async () => ({ data: batch }) })
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ url, method, body })
    if (url.startsWith('/api/processing-batches?') || url === '/api/processing-batches') {
      if (method === 'POST') return createResponse()
      return listResponse()
    }
    return { ok: false, status: 404, json: async () => ({}) }
  }) as unknown as typeof fetch
})

test('the list shows each batch with its ratio, status and an out-of-band flag', async () => {
  render(<ProcessingList basePath="/officer" />)
  const rows = await screen.findAllByRole('listitem')
  expect(rows).toHaveLength(2)
  expect(within(rows[0]).getByText('Đang mở')).toBeInTheDocument()
  expect(within(rows[0]).getByText(/tỷ lệ 5,00 : 1/)).toBeInTheDocument()
  expect(within(rows[0]).queryByText('Lệch khoảng chuẩn')).not.toBeInTheDocument()
  expect(within(rows[1]).getByText('Lệch khoảng chuẩn')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'TC-MS-20261128-01' })).toHaveAttribute('href', '/officer/processing/b1')
})

test('the status filter goes into the query', async () => {
  render(<ProcessingList basePath="/manager" />)
  await screen.findByRole('link', { name: 'TC-MS-20261128-01' })
  fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'FINISHED' } })
  await waitFor(() => expect(calls.some(c => c.url === '/api/processing-batches?status=FINISHED')).toBe(true))
})

test('opening a batch posts its date and the optional fields, then links to it', async () => {
  render(<ProcessingList basePath="/officer" />)
  await screen.findByRole('link', { name: 'TC-MS-20261128-01' })
  fireEvent.change(screen.getByLabelText('Nghệ nhân sao'), { target: { value: 'Ông A' } })
  fireEvent.click(screen.getByRole('button', { name: 'Mở mẻ mới' }))
  expect(await screen.findByText(/Đã mở mẻ TC-MS-20261128-01/)).toBeInTheDocument()
  const post = calls.find(c => c.method === 'POST')!
  expect(post.body).toMatchObject({ master_name: 'Ông A' })
  expect(post.body.processed_on).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(post.body).not.toHaveProperty('shift')
})

test('a refused opening shows the server message', async () => {
  createResponse = () => ({ ok: false, status: 422, json: async () => ({ error: { code: 'DOMAIN_ERROR', message: 'Ngày chế biến không được sau hôm nay.' } }) })
  render(<ProcessingList basePath="/officer" />)
  await screen.findByRole('link', { name: 'TC-MS-20261128-01' })
  fireEvent.click(screen.getByRole('button', { name: 'Mở mẻ mới' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Ngày chế biến không được sau hôm nay.')
})

test('no batches shows the empty state', async () => {
  listResponse = () => ok({ data: [] })
  render(<ProcessingList basePath="/officer" />)
  expect(await screen.findByText('Chưa có mẻ nào. Mở mẻ mới ở bên cạnh.')).toBeInTheDocument()
})

test('a failed load shows the error', async () => {
  listResponse = () => ({ ok: false, status: 500, json: async () => ({}) })
  render(<ProcessingList basePath="/officer" />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải dữ liệu')
})
