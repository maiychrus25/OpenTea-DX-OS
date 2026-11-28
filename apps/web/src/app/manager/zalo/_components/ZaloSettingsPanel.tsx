// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import kit from '@/components/features/dashboard/page-kit.module.css'
import styles from '@/components/features/zalo/zalo.module.css'
import {
  ZALO_EVENT_KINDS,
  ZALO_KIND_LABELS,
  type ZaloEventKind,
  type ZaloSettings,
  type ZaloSettingsInput,
} from '@/lib/zalo/zalo-types'
import { JSON_HEADERS, zaloCall } from '@/lib/zalo/zalo-api'

const SETTINGS_URL = '/api/zalo/settings'

export function ZaloSettingsPanel() {
  const [settings, setSettings] = useState<ZaloSettings | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    zaloCall<ZaloSettings>(SETTINGS_URL)
      .then((data) => {
        if (active) setSettings(data)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [])

  const toggleKind = (kind: ZaloEventKind, on: boolean) =>
    setSettings((s) => s && { ...s, kinds: ZALO_EVENT_KINDS.filter((k) => (k === kind ? on : s.kinds.includes(k))) })

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!settings) return
    const input: ZaloSettingsInput = {
      enabled: settings.enabled,
      kinds: settings.kinds,
      quiet_start_hour: settings.quiet_start_hour,
      quiet_end_hour: settings.quiet_end_hour,
      monthly_quota: settings.monthly_quota,
    }
    if (!Number.isInteger(input.quiet_start_hour) || input.quiet_start_hour < 12 || input.quiet_start_hour > 23) {
      toast.error('Giờ bắt đầu im lặng phải từ 12 đến 23.')
      return
    }
    if (!Number.isInteger(input.quiet_end_hour) || input.quiet_end_hour < 1 || input.quiet_end_hour > 11) {
      toast.error('Giờ kết thúc im lặng phải từ 1 đến 11.')
      return
    }
    if (!Number.isInteger(input.monthly_quota) || input.monthly_quota < 0 || input.monthly_quota > 10000) {
      toast.error('Hạn mức tin mỗi tháng phải là số nguyên từ 0 đến 10.000.')
      return
    }
    setBusy(true)
    try {
      setSettings(await zaloCall<ZaloSettings>(SETTINGS_URL, { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(input) }))
      toast.success('Đã lưu cài đặt Zalo.')
    } catch {
      toast.error('Không lưu được cài đặt. Thử lại sau.')
    } finally {
      setBusy(false)
    }
  }

  if (failed) return <section className={kit.card}><p role="alert" className={kit.error}>Không tải được cài đặt Zalo.</p></section>
  if (!settings) return <section className={kit.card}><p className={kit.state}>Đang tải...</p></section>

  const missingTemplates = settings.kinds_without_template.map((k) => ZALO_KIND_LABELS[k]).join(', ')

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
                <input type="checkbox" checked={settings.kinds.includes(kind)} onChange={(e) => toggleKind(kind, e.target.checked)} />
                {ZALO_KIND_LABELS[kind]}
              </label>
            ))}
          </fieldset>
          <fieldset className={styles.fieldset}>
            <legend>Giờ im lặng</legend>
            <div className={styles.filters}>
              <label className={styles.field}>
                Bắt đầu im lặng
                <input
                  className={styles.input}
                  type="number"
                  min={12}
                  max={23}
                  step={1}
                  value={settings.quiet_start_hour}
                  onChange={(e) => setSettings({ ...settings, quiet_start_hour: Number(e.target.value) })}
                />
              </label>
              <label className={styles.field}>
                Kết thúc im lặng
                <input
                  className={styles.input}
                  type="number"
                  min={1}
                  max={11}
                  step={1}
                  value={settings.quiet_end_hour}
                  onChange={(e) => setSettings({ ...settings, quiet_end_hour: Number(e.target.value) })}
                />
              </label>
            </div>
          </fieldset>
          <label className={styles.field}>
            Hạn mức tin mỗi tháng
            <input
              className={styles.input}
              type="number"
              min={0}
              max={10000}
              step={1}
              value={settings.monthly_quota}
              onChange={(e) => setSettings({ ...settings, monthly_quota: Number(e.target.value) })}
            />
          </label>
          <p className={styles.meta}>Đã dùng {settings.sent_this_month}/{settings.monthly_quota} tin tháng này.</p>
          {missingTemplates && (
            <p role="note" className={styles.meta}>Chưa có mẫu ZNS: {missingTemplates} (tin loại này sẽ bị bỏ qua).</p>
          )}
          <div className={styles.actions}>
            <button type="submit" className={kit.primary} disabled={busy}>Lưu cài đặt</button>
          </div>
        </form>
      </div>
    </section>
  )
}
