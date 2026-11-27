// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { BatchDetailView } from '@/components/features/processing/BatchDetailView'

const ticket = {
  id: 't1', ticket_no: 'HTX-PC-20261128-001', household_id: 'h1', household_name: 'Nguyễn Văn A', parcel_id: 'p1', parcel_code: 'T-01',
  cycle_id: null, grade_id: 'g1', grade_name: 'Loại 1', weighed_at: '2026-11-28T03:00:00Z', gross_kg: 100, deduction_pct: 5,
  net_kg: 95, price_vnd_per_kg: 13000, amount_vnd: '1235000', status: 'VALID', void_reason: null, settlement_id: null,
}
const freeTicket = { ...ticket, id: 't2', ticket_no: 'HTX-PC-20261128-002', net_kg: 40 }

function detailFor(overrides: Record<string, unknown> = {}, previewOverrides: Record<string, unknown> = {}) {
  return {
    batch: {
      id: 'b1', batch_code: 'TC-MS-20261128-01', processed_on: '2026-11-28', status: 'OPEN', master_name: 'Ông A', shift: 'Sáng', notes: null,
      ticket_count: 1, fresh_kg: 95, dry_kg: 19, recovery_ratio: 5, out_of_band: false, deviation_note: null, created_at: '', finished_at: null, cancel_reason: null,
      ...overrides,
    },
    tickets: [ticket],
    outputs: [{ id: 'o1', grade: 'DINH', kg: 19, remaining_kg: 19 }],
    preview: { fresh_kg: 95, dry_kg: 19, recovery_ratio: 5, out_of_band: false, ...previewOverrides },
  }
}

let detail: any
let calls: { url: string; method: string; body: any }[]
let responder: (url: string, method: string, body: any) => { ok: boolean; status: number; json: () => Promise<unknown> } | null

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data })

beforeEach(() => {
  detail = detailFor()
  calls = []
  responder = () => null
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ url, method, body })
    const custom = responder(url, method, body)
    if (custom) return custom
    if (url === '/api/processing-batches/b1' && method === 'GET') return ok({ data: detail })
    if (url.startsWith('/api/processing-batches/available-tickets')) return ok({ data: [freeTicket] })
    return ok({ data: detail })
  }) as unknown as typeof fetch
})

const posts = (suffix: string) => calls.filter(c => c.url.endsWith(suffix) && c.method !== 'GET')

test('a batch shows its ratio on the band light', async () => {
  detail = detailFor({}, { recovery_ratio: 4.2, out_of_band: true })
  render(<BatchDetailView batchId="b1" listHref="/officer/processing" />)
  expect(await screen.findByText(/Lệch khoảng chuẩn 4,50–5,00 : 1/)).toBeInTheDocument()
  expect(screen.getByText('4,20 : 1')).toBeInTheDocument()
})

test('an out-of-band batch will not finish without a note of at least ten characters, and the note box is focused', async () => {
  detail = detailFor({}, { recovery_ratio: 4.2, out_of_band: true })
  render(<BatchDetailView batchId="b1" listHref="/officer/processing" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Hoàn thành mẻ' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Nhập giải trình ít nhất 10 ký tự')
  expect(screen.getByLabelText('Giải trình khi lệch khoảng chuẩn')).toHaveFocus()
  expect(posts('/finish')).toHaveLength(0)
  fireEvent.change(screen.getByLabelText('Giải trình khi lệch khoảng chuẩn'), { target: { value: 'Lá non nhiều' } })
  fireEvent.click(screen.getByRole('button', { name: 'Hoàn thành mẻ' }))
  await waitFor(() => expect(posts('/finish')).toHaveLength(1))
  expect(posts('/finish')[0].body).toEqual({ deviation_note: 'Lá non nhiều' })
})

test('an in-band batch finishes without a note', async () => {
  render(<BatchDetailView batchId="b1" listHref="/officer/processing" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Hoàn thành mẻ' }))
  await waitFor(() => expect(posts('/finish')).toHaveLength(1))
  expect(posts('/finish')[0].body).toEqual({})
})

test('a server refusal for the deviation note shows its message, or the text for its code', async () => {
  detail = detailFor({}, { recovery_ratio: 4.2, out_of_band: true })
  responder = (url, method) => (url.endsWith('/finish') && method === 'POST'
    ? { ok: false, status: 422, json: async () => ({ error: { code: 'DEVIATION_NOTE_REQUIRED', recovery_ratio: 4.2 } }) }
    : null)
  render(<BatchDetailView batchId="b1" listHref="/officer/processing" />)
  fireEvent.change(await screen.findByLabelText('Giải trình khi lệch khoảng chuẩn'), { target: { value: 'Lá non nhiều' } })
  fireEvent.click(screen.getByRole('button', { name: 'Hoàn thành mẻ' }))
  // The server sent only the code, so the text comes from the code table.
  expect(await screen.findByRole('alert')).toHaveTextContent('Nhập giải trình (ít nhất 10 ký tự) để hoàn thành mẻ.')
})

test('picked tickets are added to the batch with their ids', async () => {
  render(<BatchDetailView batchId="b1" listHref="/officer/processing" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Tải phiếu chọn được' }))
  fireEvent.click(await screen.findByRole('checkbox'))
  expect(screen.getByText(/Đã chọn 1 phiếu, 40,0 kg tịnh/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Thêm 1 phiếu vào mẻ' }))
  await waitFor(() => expect(posts('/tickets')).toHaveLength(1))
  expect(posts('/tickets')[0].body).toEqual({ ticket_ids: ['t2'] })
})

test('a ticket voided meanwhile shows the TICKETS_CHANGED text and reloads the picker', async () => {
  responder = (url, method) => (url.endsWith('/tickets') && method === 'POST'
    ? { ok: false, status: 409, json: async () => ({ error: { code: 'TICKETS_CHANGED' } }) }
    : null)
  render(<BatchDetailView batchId="b1" listHref="/officer/processing" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Tải phiếu chọn được' }))
  fireEvent.click(await screen.findByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: 'Thêm 1 phiếu vào mẻ' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Có phiếu đã bị huỷ hoặc đã vào mẻ khác')
  expect(calls.filter(c => c.url.startsWith('/api/processing-batches/available-tickets')).length).toBeGreaterThan(1)
})

test('outputs are saved one decimal at a time, and a grade left empty is not sent', async () => {
  render(<BatchDetailView batchId="b1" listHref="/officer/processing" />)
  const dinh = await screen.findByLabelText('Đinh (kg)')
  fireEvent.change(dinh, { target: { value: '19.5' } })
  fireEvent.click(screen.getByRole('button', { name: 'Lưu sản lượng' }))
  await waitFor(() => expect(calls.some(c => c.method === 'PUT')).toBe(true))
  expect(calls.find(c => c.method === 'PUT')!.body).toEqual({ outputs: [{ grade: 'DINH', kg: 19.5 }] })
})

test('a finished batch is read-only and shows its deviation note', async () => {
  detail = detailFor({ status: 'FINISHED', finished_at: '2026-11-28T08:00:00Z', out_of_band: true, deviation_note: 'Lá non nhiều' }, { out_of_band: true, recovery_ratio: 4.2 })
  render(<BatchDetailView batchId="b1" listHref="/officer/processing" />)
  expect(await screen.findByText('Giải trình lệch chuẩn: Lá non nhiều')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Hoàn thành mẻ' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Huỷ mẻ' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Bỏ khỏi mẻ' })).not.toBeInTheDocument()
  expect(screen.getByText('còn 19,0 kg')).toBeInTheDocument()
})

test('cancelling needs a reason of three to two hundred characters', async () => {
  render(<BatchDetailView batchId="b1" listHref="/officer/processing" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Huỷ mẻ' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Nhập lý do huỷ từ 3 đến 200 ký tự.')
  expect(posts('/cancel')).toHaveLength(0)
  fireEvent.change(screen.getByLabelText('Lý do huỷ mẻ'), { target: { value: 'Nhầm ngày' } })
  fireEvent.click(screen.getByRole('button', { name: 'Huỷ mẻ' }))
  await waitFor(() => expect(posts('/cancel')).toHaveLength(1))
  expect(posts('/cancel')[0].body).toEqual({ reason: 'Nhầm ngày' })
})

test('an unknown batch shows the not-found text', async () => {
  responder = (url, method) => (url === '/api/processing-batches/b1' && method === 'GET' ? { ok: false, status: 404, json: async () => ({}) } : null)
  render(<BatchDetailView batchId="b1" listHref="/officer/processing" />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Không tìm thấy mẻ này.')
})
