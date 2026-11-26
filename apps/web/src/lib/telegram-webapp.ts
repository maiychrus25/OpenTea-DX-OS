// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export const TELEGRAM_SCRIPT_URL = 'https://telegram.org/js/telegram-web-app.js'
const FLAG = 'dxos-tg-webapp'

export interface TelegramWebApp {
  initData: string
  colorScheme: 'light' | 'dark'
  ready(): void
  expand(): void
  onEvent(name: string, handler: () => void): void
  offEvent(name: string, handler: () => void): void
  BackButton: { show(): void; hide(): void; onClick(fn: () => void): void; offClick(fn: () => void): void }
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
  }
}

/** The webview opens the page with launch parameters in the hash; the flag carries over to later pages of the same webview. */
export function isInTelegram(): boolean {
  try {
    if (/tgWebAppData=|tgWebAppPlatform=/.test(window.location.hash)) sessionStorage.setItem(FLAG, '1')
    return sessionStorage.getItem(FLAG) === '1'
  } catch {
    return /tgWebAppData=|tgWebAppPlatform=/.test(window.location.hash)
  }
}

let loading: Promise<TelegramWebApp | null> | null = null

/** Loads Telegram's script once, and only when asked; resolves null outside Telegram or when the script fails. */
export function loadTelegramWebApp(): Promise<TelegramWebApp | null> {
  if (!isInTelegram()) return Promise.resolve(null)
  loading ??= new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = TELEGRAM_SCRIPT_URL
    script.async = true
    script.onload = () => resolve(window.Telegram?.WebApp ?? null)
    script.onerror = () => resolve(null)
    document.head.appendChild(script)
  })
  return loading
}

/** Test seam: forget the memoised load. */
export function resetTelegramWebAppLoader(): void {
  loading = null
}
