// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { toast } from 'sonner'
import { ZaloCredentialsForm } from '@/app/platform/zalo/_components/ZaloCredentialsForm'
import { ZaloTemplatesForm } from '@/app/platform/zalo/_components/ZaloTemplatesForm'

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const json = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body })

beforeEach(() => jest.clearAllMocks())

describe('ZaloCredentialsForm', () => {
  it('never shows the token back, only the last four characters after a save', async () => {
    const puts: unknown[] = []
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      puts.push(JSON.parse(String(init?.body)))
      return json({ access_token_last4: 'wxyz', expires_at: '2026-12-01T00:00:00.000Z' })
    }) as unknown as typeof fetch
    const { container } = render(<ZaloCredentialsForm />)

    fireEvent.change(container.querySelector('input[type="password"]') as HTMLInputElement, { target: { value: 'secret-access-token-wxyz' } })
    fireEvent.change(container.querySelectorAll('input[type="password"]')[1] as HTMLInputElement, { target: { value: 'secret-refresh-token' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu token' }))

    expect(await screen.findByText(/\*\*\*\*wxyz/)).toBeInTheDocument()
    expect(puts[0]).toEqual({ access_token: 'secret-access-token-wxyz', refresh_token: 'secret-refresh-token' })
    expect(screen.queryByDisplayValue('secret-access-token-wxyz')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('secret-access-token-wxyz')
  })
})

describe('ZaloTemplatesForm', () => {
  it('saves a new template with its parameters split by commas', async () => {
    const puts: { templates: unknown[] }[] = []
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') { puts.push(JSON.parse(String(init.body))); return json({}) }
      return json({ templates: [{ template_key: 'PRICE_PUBLISHED', zns_template_id: '1001', params: ['gia'] }] })
    }) as unknown as typeof fetch
    render(<ZaloTemplatesForm />)
    expect(await screen.findByDisplayValue('PRICE_PUBLISHED')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Thêm mẫu' }))
    fireEvent.change(screen.getByLabelText('Mã mẫu 2'), { target: { value: 'TICKET_RECEIPT' } })
    fireEvent.change(screen.getByLabelText('ID mẫu ZNS 2'), { target: { value: '1002' } })
    fireEvent.change(screen.getByLabelText('Tham số 2'), { target: { value: 'ma phieu, so kg' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu mẫu' }))

    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0].templates[1]).toEqual({ template_key: 'TICKET_RECEIPT', zns_template_id: '1002', params: ['ma phieu', 'so kg'] })
  })

  it('refuses to save a row without a template key', async () => {
    global.fetch = jest.fn(async () => json({ templates: [] })) as unknown as typeof fetch
    render(<ZaloTemplatesForm />)
    await screen.findByText('Chưa có mẫu tin nào.')
    fireEvent.click(screen.getByRole('button', { name: 'Thêm mẫu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu mẫu' }))
    expect(toast.error).toHaveBeenCalledWith('Mỗi mẫu cần có mã mẫu và ID mẫu ZNS.')
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
})
