// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import kit from '@/components/features/farmer-web/kit.module.css'
import styles from '@/components/features/certificates/certificates.module.css'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'

const CONSENT_URL = '/api/htx/disease-training-consent'

interface TrainingConsent {
  enabled: boolean
  at: string | null
  by: string | null
}

const SAVE_FAILED_MESSAGE = 'Không lưu được. Thử lại sau.'

/** The cooperative's switch for using confirmed farmer photos to train the tea pest model. Off by default. */
export function TrainingConsentSwitch() {
  const [consent, setConsent] = useState<TrainingConsent | null>(null)
  const [failed, setFailed] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchJson<{ data: TrainingConsent }>(CONSENT_URL)
      .then(body => setConsent(body.data))
      .catch(() => setFailed(true))
  }, [])

  const save = async (enabled: boolean) => {
    setSaving(true)
    try {
      const res = await fetch(CONSENT_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      if (!res.ok) throw new Error('save')
      const body = (await res.json()) as { data: TrainingConsent }
      setConsent(body.data)
      setConfirming(false)
      toast.success(enabled ? 'Đã bật dùng ảnh để huấn luyện.' : 'Đã tắt dùng ảnh để huấn luyện.')
    } catch {
      toast.error(SAVE_FAILED_MESSAGE)
    } finally {
      setSaving(false)
    }
  }

  // Turning on asks first; turning off saves at once.
  const toggle = () => {
    if (!consent) return
    if (consent.enabled) save(false)
    else setConfirming(true)
  }

  return (
    <section className={kit.pn} aria-labelledby="training-consent-title">
      <div className={kit.ph}><h2 id="training-consent-title">Huấn luyện mô hình sâu bệnh</h2></div>
      {failed && <p role="alert" className={`${styles.error} ${styles.switchRow}`}>{LOAD_FAILED_MESSAGE}</p>}
      {!failed && (
        <div className={styles.switchRow}>
          <div className={styles.switchText}>
            <span id="training-consent-label"><strong>Cho phép dùng ảnh đã xác nhận để huấn luyện mô hình nhận diện sâu bệnh</strong></span>
            <span className={kit.muted}>
              Ảnh được xoá vị trí GPS và thông tin máy chụp (EXIF), chỉ dùng để huấn luyện mô hình nhận diện sâu bệnh chè, và anh/chị có thể tắt bất cứ lúc nào.
            </span>
            {consent?.at && (
              <span className={kit.muted}>Cập nhật lúc {new Date(consent.at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</span>
            )}
            {confirming && (
              <span className={styles.actions}>
                <span className={kit.muted}>Bật để dùng ảnh đã xác nhận cho việc huấn luyện? Bạn có thể tắt lại bất cứ lúc nào.</span>
                <button type="button" className={kit.btn} disabled={saving} onClick={() => save(true)}>Xác nhận bật</button>
                <button type="button" className={kit.btn2} disabled={saving} onClick={() => setConfirming(false)}>Huỷ</button>
              </span>
            )}
          </div>
          <button
            type="button"
            role="switch"
            className={styles.switch}
            aria-checked={consent?.enabled === true}
            aria-labelledby="training-consent-label"
            disabled={!consent || saving || confirming}
            onClick={toggle}
          />
        </div>
      )}
    </section>
  )
}
