// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import kit from '@/components/features/dashboard/page-kit.module.css'
import styles from './zalo.module.css'
import type { ZaloConsent, ZaloConsentStatus } from '@/lib/zalo/zalo-types'

const STATUS_COPY: Record<ZaloConsentStatus, string> = {
  OPTED_IN: 'Đang nhận tin',
  OPTED_OUT: 'Đã tắt nhận tin',
}

/** Officer or manager records whether a household receives Zalo messages. */
export function ZaloConsentControl({ householdId }: { householdId: string }) {
  const url = `/api/households/${encodeURIComponent(householdId)}/zalo-consent`
  const [consent, setConsent] = useState<ZaloConsent | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error('load')
      setConsent((await res.json()) as ZaloConsent | null)
      setFailed(false)
    } catch {
      setFailed(true)
    } finally {
      setLoaded(true)
    }
  }, [url])

  useEffect(() => {
    load()
  }, [load])

  const record = async (status: ZaloConsentStatus) => {
    setBusy(true)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, source: 'OFFICER' }),
      })
      if (!res.ok) throw new Error('record')
      toast.success(status === 'OPTED_IN' ? 'Đã cho phép hộ nhận tin Zalo.' : 'Đã tắt tin Zalo của hộ.')
      await load()
    } catch {
      toast.error('Không ghi nhận được. Thử lại sau.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={kit.card} aria-labelledby="zalo-consent-title">
      <div className={styles.body}>
        <h2 id="zalo-consent-title" className={styles.title}>Nhận tin Zalo</h2>
        {failed && <p role="alert" className={kit.error}>Không tải được trạng thái nhận tin.</p>}
        {!failed && !loaded && <p className={kit.state}>Đang tải...</p>}
        {!failed && loaded && (
          <>
            <p className={styles.status}>{consent ? STATUS_COPY[consent.status] : 'Chưa ghi nhận'}</p>
            {consent && (
              <p className={styles.meta}>
                Ghi nhận lúc {new Date(consent.at).toLocaleString('vi-VN')} bởi {consent.recorded_by_name ?? 'cán bộ HTX'}
              </p>
            )}
            <div className={styles.actions}>
              <button type="button" className={kit.primary} disabled={busy || consent?.status === 'OPTED_IN'} onClick={() => record('OPTED_IN')}>
                Cho phép nhận tin
              </button>
              <button type="button" className={kit.secondary} disabled={busy || consent?.status === 'OPTED_OUT'} onClick={() => record('OPTED_OUT')}>
                Tắt nhận tin
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
