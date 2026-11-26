// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { loadTelegramWebApp } from '@/lib/telegram-webapp'

/**
 * Mounted in the root layout. Outside Telegram it renders nothing and loads nothing. Inside, it follows Telegram's
 * light or dark scheme (the design tokens do the rest, so contrast stays as designed) and drives the Back button.
 */
export function TelegramWebAppShell() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    let cleanup = () => {}
    let cancelled = false
    loadTelegramWebApp().then((app) => {
      if (!app || cancelled) return
      const applyScheme = () => document.documentElement.setAttribute('data-theme', app.colorScheme)
      const goBack = () => router.back()
      app.ready()
      app.expand()
      applyScheme()
      app.onEvent('themeChanged', applyScheme)
      app.BackButton.onClick(goBack)
      cleanup = () => {
        app.offEvent('themeChanged', applyScheme)
        app.BackButton.offClick(goBack)
      }
    })
    return () => {
      cancelled = true
      cleanup()
    }
  }, [router])

  // A new page of the webview: the Back button follows whether there is somewhere to go back to.
  useEffect(() => {
    let cancelled = false
    loadTelegramWebApp().then((app) => {
      if (!app || cancelled) return
      if (window.history.length > 1) app.BackButton.show()
      else app.BackButton.hide()
    })
    return () => {
      cancelled = true
    }
  }, [pathname])

  return null
}
