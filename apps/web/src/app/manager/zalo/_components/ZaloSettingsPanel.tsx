// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import kit from '@/components/features/dashboard/page-kit.module.css'
import styles from '@/components/features/zalo/zalo.module.css'
import { LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import { ZALO_EVENT_KINDS, ZALO_KIND_LABELS, type ZaloSettings } from '@/lib/zalo/zalo-types'

export function ZaloSettingsPanel() {
  const [settings, setSettings] = useState<ZaloSettings | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    fetch('/api/zalo/settings')
      .then(async (res) => {
        if (!res.ok) throw new Error('load')
        const body = (await res.json()) as ZaloSettings
        if (active) setSettings(body)
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
    if (!settings) return
    if (!Number.isInteger(settings.monthly_quota) || settings.monthly_quota < 0) {
      toast.error('Hạn mức phải là số nguyên từ 0 trở lên.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/zalo/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: settings.enabled, kinds: settings.kinds, monthly_quota: settings.monthly_quota }),
      })
      if (!res.ok) throw new Error('save')
      toast.success('Đã lưu cài đặt Zalo.')
    } catch {
      toast.error('Không lưu được cài đặt. Thử lại sau.')
    } finally {
      setBusy(false)
    }
  }

  if (failed) return <section className={kit.card}><p role="alert" className={kit.error}>{LOAD_FAILED_MESSAGE}</p></section>
  if (!settings) return <section className={kit.card}><p className={kit.state}>Đang tải...</p></section>

  return (
    <section className={kit.card} aria-labelledby="zalo-settings-title">
      <div className={styles.body}>
        <h2 id="zalo-settings-title" className={styles.title}>Cài đặt gửi tin</h2>
        <form className={styles.form} onSubmit={save}>
          <label className={styles.check}>
            <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />
            Bật gửi tin Zalo cho HTX
          </label>
          <fieldset className={styles.fieldset}>
            <legend>Loại tin được gửi</legend>
            {ZALO_EVENT_KINDS.map((kind) => (
              <label key={kind} className={styles.check}>
                <input
                  type="checkbox"
                  checked={settings.kinds[kind]}
                  onChange={(e) => setSettings({ ...settings, kinds: { ...settings.kinds, [kind]: e.target.checked } })}
                />
                {ZALO_KIND_LABELS[kind]}
              </label>
            ))}
          </fieldset>
          <label className={styles.field}>
            Hạn mức tin mỗi tháng
            <input
              className={styles.input}
              type="number"
              min={0}
              step={1}
              value={settings.monthly_quota}
              onChange={(e) => setSettings({ ...settings, monthly_quota: Number(e.target.value) })}
            />
          </label>
          <p className={styles.meta}>
            Đã dùng trong tháng này: {settings.used_this_month} / {settings.monthly_quota} tin. Không gửi tin trong khung giờ im lặng 21:00 đến 06:00.
          </p>
          <div className={styles.actions}>
            <button type="submit" className={kit.primary} disabled={busy}>Lưu cài đặt</button>
          </div>
        </form>
      </div>
    </section>
  )
}
