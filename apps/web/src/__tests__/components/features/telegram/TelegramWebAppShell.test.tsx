// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { act, render } from '@testing-library/react'

const back = jest.fn()
let pathname = '/farmer/dashboard'
jest.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ back }),
}))

import { TelegramWebAppShell } from '@/components/features/telegram/TelegramWebAppShell'
import { resetTelegramWebAppLoader, TELEGRAM_SCRIPT_URL } from '@/lib/telegram-webapp'

function fakeWebApp(colorScheme: 'light' | 'dark') {
  const handlers: Record<string, () => void> = {}
  let backClick: (() => void) | null = null
  return {
    colorScheme,
    ready: jest.fn(),
    expand: jest.fn(),
    onEvent: jest.fn((name: string, fn: () => void) => { handlers[name] = fn }),
    offEvent: jest.fn(),
    BackButton: {
      show: jest.fn(),
      hide: jest.fn(),
      onClick: jest.fn((fn: () => void) => { backClick = fn }),
      offClick: jest.fn(),
    },
    handlers,
    pressBack: () => backClick?.(),
  }
}

const scripts = () => Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]')).filter((s) => s.src.includes('telegram'))

/** jsdom does not fetch scripts: the test plays Telegram's script by defining window.Telegram, then firing onload. */
async function finishScriptLoad(app: ReturnType<typeof fakeWebApp>) {
  ;(window as any).Telegram = { WebApp: app }
  await act(async () => { scripts()[0].onload?.(new Event('load')) })
}

describe('TelegramWebAppShell (W-2)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetTelegramWebAppLoader()
    window.location.hash = ''
    sessionStorage.clear()
    document.head.querySelectorAll('script[src]').forEach((s) => s.remove())
    document.documentElement.removeAttribute('data-theme')
    delete (window as any).Telegram
    pathname = '/farmer/dashboard'
    window.history.pushState({}, '', '/')
  })

  it('does nothing outside Telegram: no script, no theme change, no storage flag', () => {
    document.documentElement.setAttribute('data-theme', 'light')
    render(<TelegramWebAppShell />)
    expect(scripts()).toHaveLength(0)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(sessionStorage.length).toBe(0)
  })

  it('loads only the Telegram script when the launch parameters are in the hash, and remembers it', () => {
    window.location.hash = '#tgWebAppData=abc&tgWebAppPlatform=ios'
    render(<TelegramWebAppShell />)
    expect(scripts().map((s) => s.src)).toEqual([TELEGRAM_SCRIPT_URL])
    expect(sessionStorage.getItem('dxos-tg-webapp')).toBe('1')
  })

  it('stays in Telegram mode on a later page of the same webview (flag kept, hash gone)', () => {
    sessionStorage.setItem('dxos-tg-webapp', '1')
    render(<TelegramWebAppShell />)
    expect(scripts()).toHaveLength(1)
  })

  it('calls ready and expand, and follows Telegram\'s colour scheme and its changes', async () => {
    window.location.hash = '#tgWebAppPlatform=android'
    const app = fakeWebApp('dark')
    render(<TelegramWebAppShell />)
    await finishScriptLoad(app)
    expect(app.ready).toHaveBeenCalled()
    expect(app.expand).toHaveBeenCalled()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    app.colorScheme = 'light' as any
    await act(async () => app.handlers.themeChanged())
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('shows the Back button when there is history and wires it to router.back', async () => {
    sessionStorage.setItem('dxos-tg-webapp', '1')
    window.history.pushState({}, '', '/a')
    window.history.pushState({}, '', '/b')
    const app = fakeWebApp('light')
    render(<TelegramWebAppShell />)
    await finishScriptLoad(app)
    expect(app.BackButton.show).toHaveBeenCalled()
    app.pressBack()
    expect(back).toHaveBeenCalled()
  })

  it('hides the Back button on the first page of the webview', async () => {
    window.location.hash = '#tgWebAppPlatform=ios'
    Object.defineProperty(window.history, 'length', { value: 1, configurable: true })
    const app = fakeWebApp('light')
    render(<TelegramWebAppShell />)
    await finishScriptLoad(app)
    expect(app.BackButton.hide).toHaveBeenCalled()
    expect(app.BackButton.show).not.toHaveBeenCalled()
  })
})
