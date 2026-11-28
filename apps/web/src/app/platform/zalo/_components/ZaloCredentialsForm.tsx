// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import kit from '@/components/features/dashboard/page-kit.module.css'
import styles from '@/components/features/zalo/zalo.module.css'
import type { ZaloCredentials } from '@/lib/zalo/zalo-types'
import { JSON_HEADERS, formatVn, zaloCall } from '@/lib/zalo/zalo-api'

const CREDENTIALS_URL = '/api/platform/zalo/credentials'

/** Tokens are write-only: the page shows the last 4 characters and the expiry, never a token. */
export function ZaloCredentialsForm() {
  const [status, setStatus] = useState<ZaloCredentials | null>(null)
  const [failed, setFailed] = useState(false)
  const [accessToken, setAccessToken] = useState('')
  const [refreshToken, setRefreshToken] = useState('')
  const [expiresLocal, setExpiresLocal] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    zaloCall<ZaloCredentials>(CREDENTIALS_URL)
      .then((data) => {
        if (active) setStatus(data)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accessToken.trim() || !refreshToken.trim() || !expiresLocal) {
      toast.error('Nhập đủ access token, refresh token và thời điểm hết hạn.')
      return
    }
    // datetime-local has no zone; the token expiry is Vietnam time (+07:00), and the route wants an offset.
    const expiresAt = `${expiresLocal.length === 16 ? `${expiresLocal}:00` : expiresLocal}+07:00`
    setBusy(true)
    try {
      const next = await zaloCall<ZaloCredentials>(CREDENTIALS_URL, {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({ access_token: accessToken.trim(), refresh_token: refreshToken.trim(), expires_at: expiresAt }),
      })
      setStatus(next)
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
        {failed && <p role="alert" className={kit.error}>Không tải được trạng thái token.</p>}
        {status && (
          <p className={styles.meta}>
            {status.configured && status.access_token_last4 && status.expires_at
              ? `Access token đang dùng: ****${status.access_token_last4}. Hết hạn lúc ${formatVn(status.expires_at)}.`
              : 'Chưa có token'}
          </p>
        )}
        <form className={styles.form} onSubmit={save} autoComplete="off">
          <label className={styles.field}>
            Access token
            <input className={styles.input} type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} autoComplete="off" />
          </label>
          <label className={styles.field}>
            Refresh token
            <input className={styles.input} type="password" value={refreshToken} onChange={(e) => setRefreshToken(e.target.value)} autoComplete="off" />
          </label>
          <label className={styles.field}>
            Hết hạn lúc
            <input className={styles.input} type="datetime-local" value={expiresLocal} onChange={(e) => setExpiresLocal(e.target.value)} />
          </label>
          <div className={styles.actions}>
            <button type="submit" className={kit.primary} disabled={busy}>Lưu token</button>
          </div>
        </form>
      </div>
    </section>
  )
}
