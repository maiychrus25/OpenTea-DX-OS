// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { toast } from 'sonner'
import { ZaloCredentialsForm } from '@/app/platform/zalo/_components/ZaloCredentialsForm'
import { ZaloTemplatesForm } from '@/app/platform/zalo/_components/ZaloTemplatesForm'

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const wrap = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ data }) })

beforeEach(() => jest.clearAllMocks())

describe('ZaloCredentialsForm', () => {
  it('shows "Chưa có token" when nothing is configured', async () => {
    global.fetch = jest.fn(async () => wrap({ configured: false, access_token_last4: null, expires_at: null, updated_at: null })) as unknown as typeof fetch
    render(<ZaloCredentialsForm />)
    expect(await screen.findByText('Chưa có token')).toBeInTheDocument()
  })

  it('bug: the PUT carries expires_at with the +07:00 offset, then clears the tokens and shows only the last 4', async () => {
    const puts: unknown[] = []
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        puts.push(JSON.parse(String(init.body)))
        return wrap({ configured: true, access_token_last4: 'wxyz', expires_at: '2026-12-31T00:00:00+07:00', updated_at: '2026-11-28T03:00:00.000Z' })
      }
      return wrap({ configured: false, access_token_last4: null, expires_at: null, updated_at: null })
    }) as unknown as typeof fetch
    const { container } = render(<ZaloCredentialsForm />)
    await screen.findByText('Chưa có token')

    fireEvent.change(container.querySelector('input[type="password"]') as HTMLInputElement, { target: { value: 'secret-access-token-wxyz' } })
    fireEvent.change(container.querySelectorAll('input[type="password"]')[1] as HTMLInputElement, { target: { value: 'secret-refresh' } })
    fireEvent.change(container.querySelector('input[type="datetime-local"]') as HTMLInputElement, { target: { value: '2026-12-31T00:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu token' }))

    expect(await screen.findByText(/\*\*\*\*wxyz/)).toBeInTheDocument()
    expect(puts[0]).toEqual({ access_token: 'secret-access-token-wxyz', refresh_token: 'secret-refresh', expires_at: '2026-12-31T00:00:00+07:00' })
    expect(document.body.textContent).not.toContain('secret-access-token-wxyz')
    expect(container.querySelector('input[type="password"]')).toHaveValue('')
  })
})

describe('ZaloTemplatesForm', () => {
  const four = [
    { template_key: 'price_today', configured: true, zns_template_id: '1001', params: ['date'], allowed_params: ['customer_name', 'date', 'price_list'] },
    { template_key: 'ticket_receipt', configured: false, zns_template_id: null, params: [], allowed_params: ['customer_name', 'ticket_no', 'date', 'net_kg', 'amount_vnd'] },
    { template_key: 'withdrawal_ended', configured: false, zns_template_id: null, params: [], allowed_params: ['customer_name', 'parcel_code', 'safe_date'] },
    { template_key: 'settlement_closed', configured: false, zns_template_id: null, params: [], allowed_params: ['customer_name', 'period_code', 'result_label', 'amount_vnd', 'slip_url'] },
  ]

  it('renders the four keys from the wrapped data, with the unconfigured badge', async () => {
    global.fetch = jest.fn(async () => wrap(four)) as unknown as typeof fetch
    render(<ZaloTemplatesForm />)
    expect(await screen.findByLabelText('Mã mẫu ZNS: Giá hôm nay')).toHaveValue('1001')
    expect(screen.getByLabelText('Mã mẫu ZNS: Phiếu cân')).toHaveValue('')
    expect(screen.getByLabelText('Mã mẫu ZNS: Hết thời gian cách ly')).toBeInTheDocument()
    expect(screen.getByLabelText('Mã mẫu ZNS: Chốt kỳ quyết toán')).toBeInTheDocument()
    expect(screen.getAllByText('Chưa cấu hình')).toHaveLength(3)
  })

  it('saves only the rows that have an id, with params in allowed order', async () => {
    const puts: { templates: unknown[] }[] = []
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') { puts.push(JSON.parse(String(init.body))); return wrap(four) }
      return wrap(four)
    }) as unknown as typeof fetch
    render(<ZaloTemplatesForm />)
    await screen.findByLabelText('Mã mẫu ZNS: Phiếu cân')
    fireEvent.change(screen.getByLabelText('Mã mẫu ZNS: Phiếu cân'), { target: { value: 'TK_42' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'net_kg' }))
    // customer_name also exists under the price row, so pick the ticket row's box (the second one).
    fireEvent.click(screen.getAllByRole('checkbox', { name: 'customer_name' })[1])
    fireEvent.click(screen.getByRole('button', { name: 'Lưu mẫu' }))

    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0].templates).toEqual([
      { template_key: 'price_today', zns_template_id: '1001', params: ['date'] },
      { template_key: 'ticket_receipt', zns_template_id: 'TK_42', params: ['customer_name', 'net_kg'] },
    ])
    expect(toast.success).toHaveBeenCalled()
  })
})
