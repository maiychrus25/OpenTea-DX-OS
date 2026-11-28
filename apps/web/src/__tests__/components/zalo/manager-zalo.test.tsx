// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ZaloSettingsPanel } from '@/app/manager/zalo/_components/ZaloSettingsPanel'
import { ZaloDeliveriesList } from '@/app/manager/zalo/_components/ZaloDeliveriesList'

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const json = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body })

const settings = {
  enabled: true,
  kinds: { PRICE_PUBLISHED: true, TICKET_RECEIPT: true, WITHDRAWAL_ENDED: false, SETTLEMENT_CLOSED: true },
  monthly_quota: 2000,
  used_this_month: 120,
}

beforeEach(() => jest.clearAllMocks())

describe('ZaloSettingsPanel', () => {
  it('saves the kinds and the monthly quota and shows usage', async () => {
    const puts: unknown[] = []
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') { puts.push(JSON.parse(String(init.body))); return json({}) }
      return json(settings)
    }) as unknown as typeof fetch
    render(<ZaloSettingsPanel />)
    expect(await screen.findByText('Đã dùng trong tháng này: 120 / 2000 tin. Không gửi tin trong khung giờ im lặng 21:00 đến 06:00.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Chốt quyết toán' }))
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cài đặt' }))

    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0]).toEqual({
      enabled: true,
      kinds: { PRICE_PUBLISHED: true, TICKET_RECEIPT: true, WITHDRAWAL_ENDED: false, SETTLEMENT_CLOSED: false },
      monthly_quota: 2500,
    })
  })

  it('does not send a negative quota', async () => {
    const methods: (string | undefined)[] = []
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      methods.push(init?.method)
      return json(settings)
    }) as unknown as typeof fetch
    render(<ZaloSettingsPanel />)
    await screen.findByRole('spinbutton')
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cài đặt' }))
    await waitFor(() => expect(methods).not.toContain('PUT'))
  })
})

describe('ZaloDeliveriesList', () => {
  const first = {
    data: [{ id: 'd1', event_kind: 'TICKET_RECEIPT', phone_masked: '0901234567', status: 'failed', last_error_vi: 'Số không dùng Zalo', created_at: '2026-11-28T02:00:00.000Z', sent_at: null }],
    next_cursor: 'c2',
  }
  const second = {
    data: [{ id: 'd2', event_kind: 'PRICE_PUBLISHED', phone_masked: '0912345678', status: 'sent', last_error_vi: null, created_at: '2026-11-27T02:00:00.000Z', sent_at: '2026-11-27T02:01:00.000Z' }],
    next_cursor: null,
  }

  it('shows only the last three digits, filters by status and pages with the cursor', async () => {
    const urls: string[] = []
    global.fetch = jest.fn(async (url: string) => {
      urls.push(url)
      if (url.includes('cursor=c2')) return json(second)
      if (url.includes('status=failed')) return json({ data: first.data, next_cursor: 'c2' })
      return json(first)
    }) as unknown as typeof fetch
    render(<ZaloDeliveriesList />)

    expect(await screen.findByText('*******567')).toBeInTheDocument()
    expect(screen.queryByText('0901234567')).not.toBeInTheDocument()
    expect(screen.getByText('Số không dùng Zalo')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'failed' } })
    await waitFor(() => expect(urls).toContain('/api/zalo/deliveries?status=failed'))

    fireEvent.click(await screen.findByRole('button', { name: 'Tải thêm' }))
    expect(await screen.findByText('*******678')).toBeInTheDocument()
    expect(urls).toContain('/api/zalo/deliveries?status=failed&cursor=c2')
  })
})
