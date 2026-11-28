// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ZaloSettingsPanel } from '@/app/manager/zalo/_components/ZaloSettingsPanel'
import { ZaloDeliveriesList } from '@/app/manager/zalo/_components/ZaloDeliveriesList'

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const wrap = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ data }) })

const settings = {
  enabled: true,
  kinds: ['PRICE_PUBLISHED', 'TICKET_RECEIPT', 'SETTLEMENT_CLOSED'],
  quiet_start_hour: 21,
  quiet_end_hour: 6,
  monthly_quota: 2000,
  sent_this_month: 120,
  kinds_without_template: ['WITHDRAWAL_ENDED'],
}

beforeEach(() => jest.clearAllMocks())

describe('ZaloSettingsPanel', () => {
  it('renders from the wrapped data and shows usage and the missing-template note', async () => {
    global.fetch = jest.fn(async () => wrap(settings)) as unknown as typeof fetch
    render(<ZaloSettingsPanel />)
    expect(await screen.findByText('Đã dùng 120/2000 tin tháng này.')).toBeInTheDocument()
    expect(screen.getByText('Chưa có mẫu ZNS: Hết thời gian cách ly (tin loại này sẽ bị bỏ qua).')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Hết thời gian cách ly' })).not.toBeChecked()
  })

  it('bug: the PUT carries both quiet hours and kinds as an array, every field required', async () => {
    const puts: unknown[] = []
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') { puts.push(JSON.parse(String(init.body))); return wrap(settings) }
      return wrap(settings)
    }) as unknown as typeof fetch
    render(<ZaloSettingsPanel />)
    await screen.findByText('Đã dùng 120/2000 tin tháng này.')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Chốt kỳ quyết toán' }))
    fireEvent.change(screen.getByLabelText('Bắt đầu im lặng'), { target: { value: '22' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cài đặt' }))
    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0]).toEqual({
      enabled: true,
      kinds: ['PRICE_PUBLISHED', 'TICKET_RECEIPT'],
      quiet_start_hour: 22,
      quiet_end_hour: 6,
      monthly_quota: 2000,
    })
  })

  it('refuses a quiet hour out of range without calling the API', async () => {
    const methods: (string | undefined)[] = []
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => { methods.push(init?.method); return wrap(settings) }) as unknown as typeof fetch
    render(<ZaloSettingsPanel />)
    await screen.findByLabelText('Kết thúc im lặng')
    fireEvent.change(screen.getByLabelText('Kết thúc im lặng'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cài đặt' }))
    await waitFor(() => expect(methods).toEqual([undefined]))
  })
})

describe('ZaloDeliveriesList', () => {
  const rows = [
    { id: 'd1', kind: 'TICKET_RECEIPT', template_key: 'ticket_receipt', status: 'failed', phone_masked: '***123', attempts: 3, last_error: 'x', reason_vi: 'Số không dùng Zalo.', created_at: '2026-11-28T02:00:00.000Z', sent_at: null },
  ]

  it('shows the masked phone as the server sends it, and the reason', async () => {
    global.fetch = jest.fn(async () => wrap(rows)) as unknown as typeof fetch
    render(<ZaloDeliveriesList />)
    expect(await screen.findByText('***123')).toBeInTheDocument()
    expect(screen.getByText('Số không dùng Zalo.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tải thêm' })).not.toBeInTheDocument()
  })

  it('passes the status filter as a query param and reloads', async () => {
    const urls: string[] = []
    global.fetch = jest.fn(async (url: string) => { urls.push(url); return wrap(rows) }) as unknown as typeof fetch
    render(<ZaloDeliveriesList />)
    await screen.findByText('***123')
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'failed' } })
    await waitFor(() => expect(urls).toContain('/api/zalo/deliveries?status=failed'))
  })
})
