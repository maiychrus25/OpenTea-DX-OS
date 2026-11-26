// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { loadTelegramWebApp } from '@/lib/telegram-webapp'

const NOT_LINKED = 'Tài khoản Telegram này chưa liên kết với tài khoản đang đăng nhập.'

/** Binds the Telegram account to the session once, then opens the target. Outside Telegram it only navigates. */
export function TelegramOpenBinder({ target }: { target: string }) {
  const router = useRouter()
  const [refusal, setRefusal] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const app = await loadTelegramWebApp()
      if (cancelled) return
      if (!app) return router.replace(target)
      try {
        const res = await fetch('/api/telegram/webapp/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ init_data: app.initData }),
        })
        if (cancelled) return
        // 404 means the Mini App is off: the person gets the normal web.
        if (res.ok || res.status === 404) return router.replace(target)
        const body = await res.json().catch(() => null)
        setRefusal(res.status === 403 ? (body?.error?.message ?? NOT_LINKED) : 'Không mở được ứng dụng từ Telegram. Hãy thử lại.')
      } catch {
        if (!cancelled) setRefusal('Không mở được ứng dụng từ Telegram. Hãy thử lại.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [router, target])

  if (!refusal) return <p aria-live="polite">Đang mở ứng dụng...</p>
  return (
    <div role="alert">
      <p>{refusal}</p>
    </div>
  )
}
