// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { StoreHistory } from '@/app/manager/app-store/_components/StoreHistory'
import type { StoreHistoryEntry } from '@/domain/entities/app-store'

const entry = (over: Partial<StoreHistoryEntry> = {}): StoreHistoryEntry => ({
  id: 'r1',
  appId: 'tea-shop',
  appName: 'Cửa hàng chè',
  action: 'ENABLE',
  status: 'DONE',
  requestedByName: 'Nguyễn An',
  createdAt: '2026-11-13T01:30:00.000Z',
  finishedAt: '2026-11-13T01:31:00.000Z',
  error: null,
  ...over,
})
const reply = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body })
let fetchMock: jest.Mock
beforeEach(() => {
  fetchMock = jest.fn()
  global.fetch = fetchMock as unknown as typeof fetch
})

describe('StoreHistory', () => {
  test('shows a loading state, then one row per request with the exact column names', async () => {
    fetchMock.mockImplementation(() =>
      reply({
        data: [
          entry(),
          entry({ id: 'r2', action: 'DISABLE', status: 'FAILED', requestedByName: null, error: 'Hỏng' }),
          entry({ id: 'r3', status: 'PENDING' }),
          entry({ id: 'r4', status: 'RUNNING' }),
        ],
      }),
    )
    render(<StoreHistory />)
    expect(screen.getByLabelText('Đang tải')).toHaveAttribute('aria-busy', 'true')
    const table = await screen.findByRole('table')
    expect(within(table).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Thời điểm', 'Ứng dụng', 'Yêu cầu', 'Người yêu cầu', 'Kết quả'])
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(4)
    expect(within(rows[0]).getByText('Cửa hàng chè')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Cài')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Nguyễn An')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Xong')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Gỡ')).toBeInTheDocument()
    expect(within(rows[1]).getByText('—')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Lỗi')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Đang chờ')).toBeInTheDocument()
    expect(within(rows[3]).getByText('Đang xử lý')).toBeInTheDocument()
  })

  test('shows the time in Vietnam time', async () => {
    fetchMock.mockImplementation(() => reply({ data: [entry()] }))
    render(<StoreHistory />)
    expect(await screen.findByText(/08:30/)).toBeInTheDocument()
  })

  test('an empty history says so', async () => {
    fetchMock.mockImplementation(() => reply({ data: [] }))
    render(<StoreHistory />)
    expect(await screen.findByText('Chưa có yêu cầu cài hoặc gỡ nào.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  test('a failed load shows an alert', async () => {
    fetchMock.mockImplementation(() => reply({}, 500))
    render(<StoreHistory />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải dữ liệu. Vui lòng thử lại sau.')
  })
})
