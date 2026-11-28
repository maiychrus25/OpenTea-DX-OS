// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, ArrowRight, MessageCircle, Save } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import kit from '@/components/features/dashboard/page-kit.module.css'
import styles from './zalo-head.module.css'
import {
  ZALO_EVENT_KINDS,
  ZALO_KIND_LABELS,
  type ZaloEventKind,
  type ZaloSettings,
  type ZaloSettingsInput,
} from '@/lib/zalo/zalo-types'
import { JSON_HEADERS, zaloCall } from '@/lib/zalo/zalo-api'

const SETTINGS_URL = '/api/zalo/settings'
/** The save button sits in the page header, outside the form it submits. */
const FORM_ID = 'zalo-settings-form'

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

  const header = (
    <PageHeader
      icon={<MessageCircle size={28} />}
      title="Thông báo Zalo"
      description="Bật hoặc tắt việc gửi tin Zalo cho các hộ, và xem tin đã gửi."
      actions={<button type="submit" form={FORM_ID} className={kit.primary} disabled={busy || !settings}><Save size={16} aria-hidden="true" />Lưu cài đặt</button>}
    />
  )

  if (failed) return <>{header}<section className={kit.card}><p role="alert" className={kit.error}>Không tải được cài đặt Zalo.</p></section></>
  if (!settings) return <>{header}<section className={kit.card}><p className={kit.state}>Đang tải...</p></section></>

  const noTemplate = settings.kinds_without_template
  const missingTemplates = noTemplate.map((k) => ZALO_KIND_LABELS[k]).join(', ')
  const used = settings.monthly_quota > 0 ? Math.min(100, Math.round((settings.sent_this_month / settings.monthly_quota) * 100)) : 0

  return (
    <>
      {header}
      <form id={FORM_ID} className={styles.columns} onSubmit={save}>
        <section className={styles.card} aria-labelledby="zalo-settings-title">
          <h2 id="zalo-settings-title" className={styles.title}>Cài đặt gửi tin</h2>

          <div className={styles.master}>
            <span className={styles.logo} aria-hidden="true"><MessageCircle size={24} /></span>
            <span className={styles.masterText}>
              <label htmlFor="zalo-enabled">Bật gửi tin Zalo cho HTX</label>
              <small>{settings.enabled ? 'Đang bật' : 'Đang tắt'}</small>
            </span>
            <input id="zalo-enabled" type="checkbox" role="switch" aria-checked={settings.enabled} className={styles.switch} checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />
          </div>

          <fieldset className={styles.fieldset}>
            <legend>Loại tin được gửi</legend>
            <div className={styles.kinds}>
              {ZALO_EVENT_KINDS.map((kind) => (
                <div key={kind} className={styles.kind}>
                  <label>
                    <input type="checkbox" checked={settings.kinds.includes(kind)} onChange={(e) => toggleKind(kind, e.target.checked)} />
                    {ZALO_KIND_LABELS[kind]}
                  </label>
                  {noTemplate.includes(kind) && <span className={styles.tag}>Chưa có mẫu ZNS</span>}
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend>Giờ im lặng</legend>
            <div className={styles.quiet}>
              <div className={styles.field}>
                <label htmlFor="zalo-quiet-start">Bắt đầu im lặng</label>
                <span className={styles.unit}>
                  <input id="zalo-quiet-start" type="number" min={12} max={23} step={1} value={settings.quiet_start_hour} onChange={(e) => setSettings({ ...settings, quiet_start_hour: Number(e.target.value) })} />
                  giờ
                </span>
              </div>
              <ArrowRight size={18} aria-hidden="true" className={styles.arrow} />
              <div className={styles.field}>
                <label htmlFor="zalo-quiet-end">Kết thúc im lặng</label>
                <span className={styles.unit}>
                  <input id="zalo-quiet-end" type="number" min={1} max={11} step={1} value={settings.quiet_end_hour} onChange={(e) => setSettings({ ...settings, quiet_end_hour: Number(e.target.value) })} />
                  giờ
                </span>
              </div>
              <p className={styles.hint}>Không gửi tin từ {settings.quiet_start_hour} giờ đến {settings.quiet_end_hour} giờ sáng hôm sau.</p>
            </div>
          </fieldset>
        </section>

        <div className={styles.side}>
          <section className={styles.card}>
            <h2 className={styles.title}>Hạn mức tin mỗi tháng</h2>
            <div className={styles.field}>
              <label htmlFor="zalo-quota">Hạn mức tin mỗi tháng</label>
              <span className={styles.unit}>
                <input id="zalo-quota" type="number" min={0} max={10000} step={1} value={settings.monthly_quota} onChange={(e) => setSettings({ ...settings, monthly_quota: Number(e.target.value) })} />
                tin
              </span>
            </div>
            <progress className={styles.progress} value={used} max={100} aria-label="Tin đã dùng trong tháng" />
            <p className={styles.used}>Đã dùng {settings.sent_this_month}/{settings.monthly_quota} tin tháng này.</p>
          </section>

          {missingTemplates && (
            <section className={styles.warning} aria-labelledby="zalo-missing-title">
              <h2 id="zalo-missing-title"><AlertTriangle size={20} aria-hidden="true" />Chưa có mẫu ZNS</h2>
              <p>Các loại tin sau sẽ bị bỏ qua:</p>
              <ul>
                {noTemplate.map((k) => <li key={k}>{ZALO_KIND_LABELS[k]}</li>)}
              </ul>
              <p role="note">Chưa có mẫu ZNS: {missingTemplates} (tin loại này sẽ bị bỏ qua).</p>
            </section>
          )}
        </div>
      </form>
    </>
  )
}
