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
  preview: ['Yêu cầu sửa nhật ký thửa TC-A3 (23/11): Cần ghi 7 ngày'],
  canDecide: true,
  editableFields: ['reason_vi'],
  payload: { entry_id: 'e1', decision: 'REQUEST_CHANGES', reason_code: 'WITHDRAWAL_PERIOD', reason_vi: 'Cần ghi 7 ngày' },
  subjects: [{ id: 'e1', parcel: 'TC-A3', activity: 'Phun thuốc', day: '23/11' }],
  evidence: {
    rows: [
      {
        table: 'journal_entries',
        id: 'e1',
        sha256: 'abc',
        values: {
          id: 'e1',
          status: 'PENDING_APPROVAL',
          notes: null,
          updated_at: '2026-11-23T03:00:00.000Z',
          entry_date: '2026-11-23T00:00:00.000Z',
          activity_type: 'SPRAYING',
          activities: [
            {
              id: 'a1',
              activity_detail: 'Phun ngừa sâu',
              product_name: 'Actara 25WG',
              dosage: '1.200 ml/bình 16L',
              withdrawal_days: 3,
              safe_harvest_date: '2026-11-26T00:00:00.000Z',
            },
          ],
        },
      },
    ],
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
    expect(screen.getByText('Thửa TC-A3 · Phun thuốc · 23/11/2026')).toBeInTheDocument()
    expect(screen.getByText('Trạng thái: Chờ duyệt')).toBeInTheDocument()
    expect(screen.getByText('Ghi chú: Không có ghi chú')).toBeInTheDocument()
    expect(screen.getByText('Actara 25WG — 1.200 ml/bình 16L — cách ly 3 ngày (an toàn từ 26/11/2026)')).toBeInTheDocument()
    expect(screen.queryByText(/activity_type|PENDING_APPROVAL|e1|updated_at|\{/)).not.toBeInTheDocument()

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

  test('filters the open list by kind and by risk', async () => {
    const other: ProposalInboxItem = {
      ...sampleItem,
      id: '00000000-0000-0000-0000-000000000002',
      kind: 'journal.approve',
      titleVi: 'Duyệt nhật ký canh tác',
      risk: 'high',
      editableFields: [],
    }
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [sampleItem, other] }),
    }) as unknown as typeof fetch

    render(<ProposalInbox role="manager" />)
    expect(await screen.findByText('Trả lại nhật ký canh tác')).toBeInTheDocument()
    expect(screen.getByText('Duyệt nhật ký canh tác')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Mức rủi ro'), { target: { value: 'high' } })
    expect(screen.queryByText('Trả lại nhật ký canh tác')).not.toBeInTheDocument()
    expect(screen.getByText('Duyệt nhật ký canh tác')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Mức rủi ro'), { target: { value: 'all' } })
    fireEvent.change(screen.getByLabelText('Loại đề xuất'), { target: { value: 'journal.reject' } })
    expect(screen.getByText('Trả lại nhật ký canh tác')).toBeInTheDocument()
    expect(screen.queryByText('Duyệt nhật ký canh tác')).not.toBeInTheDocument()
  })

  test('edits the editable field and approves with edited_payload', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [sampleItem] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: { outcome: 'executed', result: {} } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [] }) })
    global.fetch = fetchMock as unknown as typeof fetch

    render(<ProposalInbox role="officer" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa rồi duyệt' }))

    const field = screen.getByLabelText('Nội dung lý do gửi nông hộ')
    expect(field).toHaveValue('Cần ghi 7 ngày')
    fireEvent.change(field, { target: { value: 'Vui lòng ghi rõ 7 ngày cách ly' } })
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt bản đã sửa' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/agent/proposals/${sampleItem.id}/decision`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ decision: 'approve', edited_payload: { reason_vi: 'Vui lòng ghi rõ 7 ngày cách ly' } }),
        })
      )
    })
  })

  test('marks the active view with aria-pressed and links evidence to its page', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [sampleItem] }) }) as unknown as typeof fetch

    render(<ProposalInbox role="officer" />)
    expect(await screen.findByText('Trả lại nhật ký canh tác')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Đang chờ duyệt' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('link', { name: 'Mở nhật ký' })).toHaveAttribute('href', '/officer/journal')

    fireEvent.click(screen.getByRole('button', { name: 'Lịch sử' }))
    expect(screen.getByRole('button', { name: 'Lịch sử' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('flags the reject note as invalid and points it at the error', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [sampleItem] }) }) as unknown as typeof fetch

    render(<ProposalInbox role="officer" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Từ chối' }))
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận từ chối' }))

    const note = screen.getByLabelText('Lý do từ chối')
    expect(note).toHaveAttribute('aria-invalid', 'true')
    expect(note).toHaveAttribute('aria-describedby', 'proposal-reject-error')
    expect(screen.getByRole('alert')).toHaveAttribute('id', 'proposal-reject-error')
  })
})
