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
const json = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body })

let current: unknown
let posts: { body: unknown }[]

beforeEach(() => {
  jest.clearAllMocks()
  posts = []
  global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posts.push({ body: JSON.parse(String(init.body)) })
      return json({})
    }
    return json(current)
  }) as unknown as typeof fetch
})

describe('ZaloConsentControl (officer and manager)', () => {
  it('shows the recorded status and disables the button that would change nothing', async () => {
    current = { status: 'OPTED_IN', at: '2026-11-28T03:00:00.000Z', recorded_by_name: 'Cán bộ A' }
    render(<ZaloConsentControl householdId="hh-1" />)
    expect(await screen.findByText('Đang nhận tin')).toBeInTheDocument()
    expect(screen.getByText(/Cán bộ A/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cho phép nhận tin' })).toBeDisabled()
    expect(global.fetch).toHaveBeenCalledWith(URL)
  })

  it('records an opt-out as the officer and reloads the status', async () => {
    current = { status: 'OPTED_IN', at: '2026-11-28T03:00:00.000Z', recorded_by_name: null }
    render(<ZaloConsentControl householdId="hh-1" />)
    await screen.findByText('Đang nhận tin')
    current = { status: 'OPTED_OUT', at: '2026-11-28T04:00:00.000Z', recorded_by_name: 'Cán bộ A' }
    fireEvent.click(screen.getByRole('button', { name: 'Tắt nhận tin' }))
    expect(await screen.findByText('Đã tắt nhận tin')).toBeInTheDocument()
    expect(posts).toEqual([{ body: { status: 'OPTED_OUT', source: 'OFFICER' } }])
    expect(toast.success).toHaveBeenCalled()
  })
})

describe('FarmerZaloOptOut', () => {
  it('lets the farmer turn messages off for their own household only', async () => {
    current = null
    render(<FarmerZaloOptOut householdId="hh-1" />)
    expect(await screen.findByRole('heading', { name: 'Nhận tin Zalo: Chưa ghi nhận' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tắt nhận tin' }))
    expect(await screen.findByRole('heading', { name: 'Nhận tin Zalo: Đã tắt' })).toBeInTheDocument()
    expect(posts).toEqual([{ body: { status: 'OPTED_OUT', source: 'MEMBER' } }])
    expect(screen.getByRole('button', { name: 'Tắt nhận tin' })).toBeDisabled()
  })

  it('shows the active label when the household still receives messages', async () => {
    current = { status: 'OPTED_IN', at: '2026-11-28T03:00:00.000Z', recorded_by_name: null }
    render(<FarmerZaloOptOut householdId="hh-1" />)
    expect(await screen.findByRole('heading', { name: 'Nhận tin Zalo: Đang nhận' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tắt nhận tin' })).toBeEnabled()
  })
})
