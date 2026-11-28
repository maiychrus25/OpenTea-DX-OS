// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import kit from '@/components/features/dashboard/page-kit.module.css'
import { fetchJson } from '@/lib/api/fetch-json'
import styles from './TrainingConsentSwitch.module.css'

const CONSENT_URL = '/api/htx/disease-training-consent'

interface TrainingConsent {
  enabled: boolean
  at: string | null
  by: string | null
}

const SAVE_FAILED_MESSAGE = 'Không lưu được. Thử lại sau.'
const LOAD_FAILED_MESSAGE = 'Không tải được cài đặt huấn luyện.'

/** The cooperative's switch for using confirmed farmer photos to train the tea pest model. */
export function TrainingConsentSwitch() {
  const [consent, setConsent] = useState<TrainingConsent | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchJson<{ data: TrainingConsent }>(CONSENT_URL)
      .then(body => setConsent(body.data))
      .catch(() => setFailed(true));
  }, []);

  const save = async (enabled: boolean) => {
    setSaving(true);
    try {
      const res = await fetch(CONSENT_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error('save');
      const body = (await res.json()) as { data: TrainingConsent };
      setConsent(body.data);
      setConfirming(false);
      toast.success(enabled ? 'Đã bật dùng ảnh để huấn luyện.' : 'Đã tắt dùng ảnh để huấn luyện.');
    } catch {
      toast.error(SAVE_FAILED_MESSAGE);
    } finally {
      setSaving(false);
    }
  };

  const onToggle = (checked: boolean) => {
    if (checked) setConfirming(true);
    else save(false);
  };

  return (
    <section className={kit.card} aria-labelledby="training-consent-title">
      <div className={styles.body}>
        <h2 id="training-consent-title" className={styles.title}>Huấn luyện mô hình sâu bệnh</h2>
        {failed && <p role="alert" className={kit.error}>{LOAD_FAILED_MESSAGE}</p>}
        {!failed && !consent && <p className={kit.state}>Đang tải...</p>}
        {!failed && consent && (
          <>
            <label className={styles.row}>
              <input
                type="checkbox"
                role="switch"
                checked={consent.enabled}
                disabled={saving || confirming}
                onChange={(e) => onToggle(e.target.checked)}
              />{' '}
              Cho phép dùng ảnh đã xác nhận để huấn luyện mô hình nhận diện sâu bệnh
            </label>
            <p className={styles.explain}>
              Ảnh được xoá vị trí GPS và thông tin máy chụp (EXIF), chỉ dùng để huấn luyện mô hình nhận diện sâu bệnh chè, và anh/chị có thể tắt bất cứ lúc nào.
            </p>
            {consent.at && <p className={styles.meta}>Cập nhật lúc {new Date(consent.at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p>}
            {confirming && (
              <div className={styles.confirm}>
                <p className={styles.explain}>Bật để dùng ảnh đã xác nhận cho việc huấn luyện? Bạn có thể tắt lại bất cứ lúc nào.</p>
                <button type="button" className={kit.primary} disabled={saving} onClick={() => save(true)}>Xác nhận bật</button>
                <button type="button" className={kit.secondary} disabled={saving} onClick={() => setConfirming(false)}>Huỷ</button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
