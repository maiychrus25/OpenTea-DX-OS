// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { OverviewJournal, type OverviewEntry } from '@/components/features/officer-web/OverviewJournal'
import { OverviewActivityChart, OverviewSparkline } from '@/components/features/officer-web/OverviewCharts'
import { weeklyActivity } from '@/components/features/officer-web/overview-data'

const refresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const entry: OverviewEntry = { id: 'journal-1', parcelCode: 'P-TC-001', household: 'Hộ chè', activity: 'Phun thuốc', date: '27/11', status: 'PENDING_APPROVAL' }
const show = (entries = [entry]) => render(<OverviewJournal entries={entries} page={1} total={7} pageCount={2} />)
beforeEach(() => { jest.clearAllMocks() })

describe('overview journal actions', () => {
  it('approves through the existing API and refreshes totals only after confirmed success', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { approved_count: 1, failed_ids: [] } }) })
    show()
    fireEvent.click(screen.getByRole('button', { name: /Duyệt nhật ký/ }))
    expect(screen.getByRole('button', { name: /Duyệt nhật ký/ })).toBeDisabled()
    expect(await screen.findByText('Đã duyệt')).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledWith('/api/journal/batch-approve', expect.objectContaining({ method: 'POST', body: JSON.stringify({ entry_ids: ['journal-1'] }) }))
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: /Duyệt nhật ký/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Mở nhật ký/ })).toHaveAttribute('href', '/officer/journal?entryId=journal-1')
  })
  it.each([
    { ok: true, data: { approved_count: 0, failed_ids: ['journal-1'] } },
    { ok: false, data: undefined },
  ])('retains pending state and permits retry on failed or partial approval: %j', async ({ ok, data }) => {
    global.fetch = jest.fn().mockResolvedValue({ ok, json: async () => ({ data }) })
    show()
    fireEvent.click(screen.getByRole('button', { name: /Duyệt nhật ký/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa duyệt được nhật ký')
    expect(screen.getByText('Chờ duyệt')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Duyệt nhật ký/ })).toBeEnabled()
    expect(refresh).not.toHaveBeenCalled()
  })
  it('handles network failure and blocks rapid duplicate approvals', async () => {
    let fail!: (error: Error) => void
    global.fetch = jest.fn(() => new Promise((_resolve, reject) => { fail = reject })) as jest.Mock
    show()
    const button = screen.getByRole('button', { name: /Duyệt nhật ký/ })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(global.fetch).toHaveBeenCalledTimes(1)
    fail(new Error('Mất kết nối'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Mất kết nối')
    await waitFor(() => expect(button).toBeEnabled())
  })
  it('keeps an empty table and accessible page links, without approval for reviewed entries', () => {
    const { unmount } = show([{ ...entry, status: 'REQUEST_CHANGES' }])
    expect(screen.getByText('Yêu cầu sửa')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Trang sau' })).toHaveAttribute('href', '/officer/dashboard?page=2')
    expect(screen.queryByRole('link', { name: 'Trang trước' })).not.toBeInTheDocument()
    unmount()
    show([])
    expect(screen.getByTestId('task-table')).toHaveTextContent('Chưa có nhật ký nào')
  })
})

describe('overview real-data charts', () => {
  const now = new Date('2026-11-27T08:00:00Z')
  it('does not invent a sparkline when the cohort has no dated events', () => {
    render(<OverviewSparkline values={[0, 0, 0, 0, 0, 0, 0]} label="Nông hộ mới" />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
  it('exposes all nonzero types, exact values, a table and the partial week', () => {
    render(<OverviewActivityChart weeks={weeklyActivity([
      { entry_date: now, activity_type: 'SPRAYING' }, { entry_date: now, activity_type: 'OTHER' },
    ], now)} />)
    expect(screen.getByRole('table')).toHaveTextContent('26/11–27/11')
    expect(screen.getByRole('table')).toHaveTextContent('Phun thuốc')
    expect(screen.getByRole('table')).toHaveTextContent('Khác')
    expect(screen.getByLabelText('26/11–27/11: Phun thuốc 1')).toBeInTheDocument()
  })
  it('renders a meaningful empty chart instead of sample bars', () => {
    render(<OverviewActivityChart weeks={weeklyActivity([], now)} />)
    expect(screen.getByText('Chưa có hoạt động canh tác trong 30 ngày.')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
