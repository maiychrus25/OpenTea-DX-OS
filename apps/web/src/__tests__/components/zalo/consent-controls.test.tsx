// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { toast } from 'sonner'
import { ZaloConsentControl } from '@/components/features/zalo/ZaloConsentControl'
import { FarmerZaloOptOut } from '@/components/features/zalo/FarmerZaloOptOut'

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const URL = '/api/households/hh-1/zalo-consent'
const wrap = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ data }) })

let current: unknown
let posts: unknown[]

beforeEach(() => {
  jest.clearAllMocks()
  posts = []
  global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body))
      posts.push(body)
      current = { status: body.status, source: body.source, at: '2026-11-28T04:00:00.000Z' }
      return wrap(current)
    }
    return wrap(current)
  }) as unknown as typeof fetch
})

describe('ZaloConsentControl (officer and manager)', () => {
  it('shows the status and the source, and never Invalid Date', async () => {
    current = { status: 'OPTED_IN', source: 'REGISTRATION', at: '2026-11-28T03:00:00.000Z' }
    render(<ZaloConsentControl householdId="hh-1" />)
    expect(await screen.findByText('Đang nhận tin')).toBeInTheDocument()
    expect(screen.getByText(/Cập nhật lúc .* · khi đăng ký/)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('Invalid Date')
    expect(screen.getByRole('button', { name: 'Cho phép nhận tin' })).toBeDisabled()
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(URL)
  })

  it('shows "Chưa ghi nhận" with no time line when nothing is recorded', async () => {
    current = { status: null, source: null, at: null }
    render(<ZaloConsentControl householdId="hh-1" />)
    expect(await screen.findByText('Chưa ghi nhận')).toBeInTheDocument()
    expect(screen.queryByText(/Cập nhật lúc/)).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('Invalid Date')
  })

  it('records an opt-out as the officer and shows the new status from the response', async () => {
    current = { status: 'OPTED_IN', source: 'REGISTRATION', at: '2026-11-28T03:00:00.000Z' }
    render(<ZaloConsentControl householdId="hh-1" />)
    await screen.findByText('Đang nhận tin')
    fireEvent.click(screen.getByRole('button', { name: 'Tắt nhận tin' }))
    expect(await screen.findByText('Đã tắt nhận tin')).toBeInTheDocument()
    expect(screen.getByText(/cán bộ ghi nhận/)).toBeInTheDocument()
    expect(posts).toEqual([{ status: 'OPTED_OUT', source: 'OFFICER' }])
    expect(toast.success).toHaveBeenCalled()
  })
})

describe('FarmerZaloOptOut', () => {
  it('shows the label and the opt-out only after a confirm step', async () => {
    current = { status: 'OPTED_IN', source: 'REGISTRATION', at: '2026-11-28T03:00:00.000Z' }
    render(<FarmerZaloOptOut householdId="hh-1" />)
    expect(await screen.findByRole('heading', { name: 'Nhận tin Zalo: Đang nhận' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tắt nhận tin' }))
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận tắt' }))
    expect(await screen.findByRole('heading', { name: 'Nhận tin Zalo: Đã tắt' })).toBeInTheDocument()
    expect(screen.getByText('Muốn nhận lại, báo cán bộ HTX.')).toBeInTheDocument()
    expect(posts).toEqual([{ status: 'OPTED_OUT', source: 'MEMBER' }])
    expect(screen.queryByRole('button', { name: 'Tắt nhận tin' })).not.toBeInTheDocument()
  })

  it('shows the status with the label, not a blank, when nothing is recorded', async () => {
    current = { status: null, source: null, at: null }
    render(<FarmerZaloOptOut householdId="hh-1" />)
    expect(await screen.findByRole('heading', { name: 'Nhận tin Zalo: Chưa đăng ký' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tắt nhận tin' })).not.toBeInTheDocument()
    expect(screen.getByText('Muốn nhận lại, báo cán bộ HTX.')).toBeInTheDocument()
  })
})
