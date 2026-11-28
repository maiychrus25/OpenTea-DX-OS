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

it('shows waiting journals first and approves the one on the row', async () => {
  render(<ApproveList />)
  await screen.findByRole('cell', { name: 'P-1' })
  expect(screen.queryByRole('cell', { name: 'P-3' })).not.toBeInTheDocument()
  expect(screen.getAllByText('Lò Thị Mai').length).toBeGreaterThan(0)

  fireEvent.click(screen.getAllByRole('button', { name: 'Duyệt' })[0])
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/journal/batch-approve', expect.objectContaining({ body: JSON.stringify({ entry_ids: ['a'] }) })))

  fireEvent.click(await screen.findByRole('button', { name: 'Từ chối (1)' }))
  expect(screen.getByRole('cell', { name: 'P-4' })).toBeInTheDocument()
})

it('sends the reason when a waiting journal is not approved', async () => {
  render(<ApproveList />)
  await screen.findByRole('cell', { name: 'P-1' })
  fireEvent.click(screen.getAllByRole('button', { name: 'Từ chối' })[0])
  fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Thiếu ảnh' } })
  fireEvent.click(screen.getByRole('button', { name: 'Gửi', hidden: true }))
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/journal/a/review', expect.objectContaining({ body: JSON.stringify({ decision: 'REQUEST_CHANGES', reason: 'Thiếu ảnh' }) })))
})
