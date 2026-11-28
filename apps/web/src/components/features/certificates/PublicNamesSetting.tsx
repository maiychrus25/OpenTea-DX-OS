// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import kit from '@/components/features/farmer-web/kit.module.css'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import { processingErrorText } from '@/lib/processing/errors'
import styles from './certificates.module.css'

/** Manager switch: whether the public trace page may show people's names. Off by default. */
export function PublicNamesSetting() {
  const [showNames, setShowNames] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchJson<{ data: { public_show_names: boolean } }>('/api/htx/public-settings')
      .then(body => setShowNames(body.data.public_show_names))
      .catch(() => setError(LOAD_FAILED_MESSAGE))
  }, [])

  async function toggle() {
    if (showNames === null) return
    const next = !showNames
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/htx/public-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_show_names: next }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(processingErrorText(json?.error?.code, json?.error?.message, 'Không lưu được cài đặt.')); return }
      setShowNames(json.data.public_show_names)
    } catch {
      setError('Lỗi kết nối máy chủ.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={kit.pn} aria-labelledby="public-names-title">
      <div className={kit.ph}><h2 id="public-names-title">Trang truy xuất công khai</h2></div>
      <div className={styles.switchRow}>
        <div className={styles.switchText}>
          <span id="public-names-label"><strong>Hiện tên người trên trang truy xuất công khai</strong></span>
          <span className={kit.muted}>
            Đang tắt: trang QR không hiện họ tên chủ hộ, người ghi nhật ký hay nghệ nhân sao. Đang bật: các tên này hiện trên mọi lô, kể cả lô đã xuất QR trước đó.
          </span>
          {error && <span role="alert" className={styles.error}>{error}</span>}
        </div>
        <button type="button" role="switch" className={styles.switch} aria-checked={showNames === true} aria-labelledby="public-names-label"
          disabled={showNames === null || busy} onClick={toggle} />
      </div>
    </section>
  )
}
