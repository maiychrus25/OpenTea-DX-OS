// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'

const replace = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))

import { TelegramOpenBinder } from '@/components/features/telegram/TelegramOpenBinder'
import { resetTelegramWebAppLoader } from '@/lib/telegram-webapp'

function inTelegram(initData = 'raw-init-data') {
  sessionStorage.setItem('dxos-tg-webapp', '1')
  ;(window as any).Telegram = { WebApp: { initData } }
  // jsdom never fetches the script: resolve it as soon as it is appended.
  jest.spyOn(document.head, 'appendChild').mockImplementation((node: any) => {
    setTimeout(() => node.onload?.(new Event('load')))
    return node
  })
}

const answer = (status: number, body: unknown) =>
  (global.fetch as jest.Mock).mockResolvedValue({ ok: status < 300, status, json: async () => body })

describe('TelegramOpenBinder (W-2)', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
    resetTelegramWebAppLoader()
    sessionStorage.clear()
    delete (window as any).Telegram
    global.fetch = jest.fn()
  })

  it('outside Telegram it only goes to the target, with no request', async () => {
    render(<TelegramOpenBinder target="/farmer/dashboard" />)
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/farmer/dashboard'))
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('posts initData once and goes to the target on success', async () => {
    inTelegram()
    answer(200, { data: { telegram_user_id: 1 } })
    render(<TelegramOpenBinder target="/manager/ai?proposal=p1" />)
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/manager/ai?proposal=p1'))
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('/api/telegram/webapp/session')
    expect(JSON.parse(init.body)).toEqual({ init_data: 'raw-init-data' })
  })

  it('shows the normal web when the Mini App is disabled', async () => {
    inTelegram()
    answer(404, { error: { code: 'WEBAPP_DISABLED' } })
    render(<TelegramOpenBinder target="/farmer/dashboard" />)
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/farmer/dashboard'))
  })

  it('refuses with the reason when the Telegram account is not linked, and does not navigate', async () => {
    inTelegram()
    answer(403, { error: { code: 'WEBAPP_NOT_LINKED', message: 'Tài khoản Telegram này chưa liên kết với tài khoản đang đăng nhập.' } })
    render(<TelegramOpenBinder target="/farmer/dashboard" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Tài khoản Telegram này chưa liên kết với tài khoản đang đăng nhập.')
    expect(replace).not.toHaveBeenCalled()
  })
})
