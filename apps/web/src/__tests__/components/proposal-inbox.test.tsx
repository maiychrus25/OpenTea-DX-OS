// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ProposalInbox, type ProposalInboxItem } from '@/components/features/agent/ProposalInbox'

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}))

jest.mock('@/lib/api/redirect-to-login', () => ({
  redirectToLogin: jest.fn(),
}))

const sampleItem: ProposalInboxItem = {
  id: '00000000-0000-0000-0000-000000000001',
  agent: 'journal-review',
  kind: 'journal.reject',
  titleVi: 'Trả lại nhật ký canh tác',
  reasonVi: 'Nhật ký phun thuốc sai số ngày cách ly',
  risk: 'medium',
  status: 'proposed',
  createdAt: '2026-11-24T01:00:00.000Z',
  expiresAt: '2026-11-27T01:00:00.000Z',
  preview: ['Yêu cầu sửa nhật ký e1: Cần ghi 7 ngày'],
  canDecide: true,
  subjects: [{ id: 'e1', label: 'Thửa TC-A3 · SPRAYING · 23/11' }],
  evidence: {
    rows: [{ table: 'journal_entries', id: 'e1', sha256: 'abc', values: { status: 'PENDING_APPROVAL' } }],
    sha256: 'def',
  },
}

describe('ProposalInbox', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  test('renders proposal card, enforces reject note and posts decision', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [sampleItem] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: { outcome: 'rejected' } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [] }) })
    global.fetch = fetchMock as unknown as typeof fetch

    render(<ProposalInbox role="officer" />)

    expect(await screen.findByText('Trả lại nhật ký canh tác')).toBeInTheDocument()
    expect(screen.getByText('Thửa TC-A3 · SPRAYING · 23/11')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }))
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận từ chối' }))
    expect(await screen.findByText('Vui lòng nhập lý do từ chối')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Lý do từ chối'), { target: { value: 'Đã kiểm tra lại' } })
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận từ chối' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/agent/proposals/${sampleItem.id}/decision`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ decision: 'reject', note: 'Đã kiểm tra lại' }),
        })
      )
    })
  })

  test('hides action buttons when canDecide is false', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ ...sampleItem, canDecide: false }] }),
    }) as unknown as typeof fetch

    render(<ProposalInbox role="officer" />)

    expect(await screen.findByText('Trả lại nhật ký canh tác')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Duyệt' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Từ chối' })).not.toBeInTheDocument()
  })
})
