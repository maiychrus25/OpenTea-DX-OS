// SPDX-License-Identifier: MIT

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ApproveList } from '@/app/manager/journal-approve/_components/ApproveList'

const now = new Date().toISOString()
const old = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
const entry = (id: string, parcel: string, status: string, created: string, approved: string | null = null) => ({
  id, parcel_code: parcel, household_id: 'h1', status, entry_date: created, created_at: created, approved_at: approved,
  activity_type: 'SPRAYING', performed_by: 'x', notes: null, activities: [{ activity_detail: 'SPRAYING', product_name: 'Abamectin', withdrawal_days: 7 }],
})
const entries = [entry('a', 'P-1', 'PENDING_APPROVAL', now), entry('b', 'P-2', 'PENDING_APPROVAL', old), entry('c', 'P-3', 'APPROVED', now, now), entry('d', 'P-4', 'REQUEST_CHANGES', now)]

beforeEach(() => {
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => (init?.method === 'POST'
      ? { data: { approved_count: 1, failed_ids: [] } }
      : { data: String(url).includes('households') ? [{ id: 'h1', name: 'Lò Thị Mai' }] : entries }),
  })) as unknown as typeof fetch
})

it('filters by the status tab pressed and approves only waiting journals that are chosen', async () => {
  render(<ApproveList />)
  await screen.findByText('P-1')
  expect(screen.queryByText('P-3')).not.toBeInTheDocument()
  expect(screen.getAllByText('Lò Thị Mai').length).toBeGreaterThan(0)

  fireEvent.click(screen.getByRole('button', { name: 'Quá hạn (1)' }))
  expect(screen.getByText('P-2')).toBeInTheDocument()
  expect(screen.queryByText('P-1')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Chọn nhật ký 1' }))
  fireEvent.click(screen.getByRole('button', { name: 'Duyệt (1)' }))
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/journal/batch-approve', expect.objectContaining({ body: JSON.stringify({ entry_ids: ['b'] }) })))

  fireEvent.click(await screen.findByRole('button', { name: 'Đã duyệt (1)' }))
  expect(screen.getByRole('checkbox', { name: 'Chọn nhật ký 1' })).toBeDisabled()
})

it('approves more than fifty journals in batches of fifty', async () => {
  const many = Array.from({ length: 60 }, (_, i) => entry(`e${i}`, `P-${i}`, 'PENDING_APPROVAL', now))
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => (init?.method === 'POST'
      ? { data: { approved_count: JSON.parse(String(init.body)).entry_ids.length, failed_ids: [] } }
      : { data: String(url).includes('households') ? [] : many }),
  })) as unknown as typeof fetch
  render(<ApproveList />)
  await screen.findByText('P-0')
  fireEvent.click(screen.getByRole('checkbox', { name: 'Chọn tất cả (60)' }))
  fireEvent.click(screen.getByRole('button', { name: 'Duyệt (60)' }))
  await screen.findByText('Đã duyệt 60 nhật ký thành công.')
  const sizes = (global.fetch as jest.Mock).mock.calls.filter(([, init]) => init?.method === 'POST').map(([, init]) => JSON.parse(init.body).entry_ids.length)
  expect(sizes).toEqual([50, 10])
})

it('sends the reason when a waiting journal is not approved', async () => {
  render(<ApproveList />)
  await screen.findByText('P-1')
  fireEvent.click(screen.getAllByRole('button', { name: 'Từ chối' })[0])
  fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Thiếu ảnh' } })
  fireEvent.click(screen.getByRole('button', { name: 'Gửi', hidden: true }))
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/journal/a/review', expect.objectContaining({ body: JSON.stringify({ decision: 'REQUEST_CHANGES', reason: 'Thiếu ảnh' }) })))
})
