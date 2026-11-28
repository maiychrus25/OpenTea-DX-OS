// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useState } from 'react'
import { toast } from 'sonner'
import kit from '@/components/features/dashboard/page-kit.module.css'
import formStyles from '../../_components/platform.module.css'
import styles from '@/components/features/zalo/zalo.module.css'
import type { ZaloCredentialsSaved } from '@/lib/zalo/zalo-types'

/** Tokens are write-only: after a save the page shows the last 4 characters and the expiry, never the token. */
export function ZaloCredentialsForm() {
  const [accessToken, setAccessToken] = useState('')
  const [refreshToken, setRefreshToken] = useState('')
  const [saved, setSaved] = useState<ZaloCredentialsSaved | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accessToken.trim() || !refreshToken.trim()) {
      toast.error('Nhập cả access token và refresh token.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/platform/zalo/credentials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: accessToken.trim(), refresh_token: refreshToken.trim() }),
      })
      if (!res.ok) throw new Error('save')
      const body = (await res.json()) as ZaloCredentialsSaved
      setSaved({ access_token_last4: body.access_token_last4, expires_at: body.expires_at })
      setAccessToken('')
      setRefreshToken('')
      toast.success('Đã lưu token Zalo.')
    } catch {
      toast.error('Không lưu được token. Thử lại sau.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={kit.card} aria-labelledby="zalo-credentials-title">
      <div className={styles.body}>
        <h2 id="zalo-credentials-title" className={styles.title}>Token Official Account</h2>
        {saved && (
          <p className={styles.meta}>
            Access token đang dùng: ****{saved.access_token_last4}. Hết hạn lúc {new Date(saved.expires_at).toLocaleString('vi-VN')}.
          </p>
        )}
        <form className={formStyles.form} onSubmit={save} autoComplete="off">
          <label>
            Access token
            <input type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} autoComplete="off" />
          </label>
          <label>
            Refresh token
            <input type="password" value={refreshToken} onChange={(e) => setRefreshToken(e.target.value)} autoComplete="off" />
          </label>
          <div className={styles.actions}>
            <button type="submit" className={kit.primary} disabled={busy}>Lưu token</button>
          </div>
        </form>
      </div>
    </section>
  )
}
