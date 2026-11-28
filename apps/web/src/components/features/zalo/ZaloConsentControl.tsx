// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import kit from '@/components/features/dashboard/page-kit.module.css'
import styles from './zalo.module.css'
import { CONSENT_SOURCE_LABELS, type ZaloConsent } from '@/lib/zalo/zalo-types'
import { JSON_HEADERS, formatVn, zaloCall } from '@/lib/zalo/zalo-api'

const STATUS_TEXT: Record<'OPTED_IN' | 'OPTED_OUT', string> = {
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

  useEffect(() => {
    let active = true
    zaloCall<ZaloConsent>(url)
      .then((data) => {
        if (active) setConsent(data)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
      .finally(() => {
        if (active) setLoaded(true)
      })
    return () => {
      active = false
    }
  }, [url])

  const record = async (status: 'OPTED_IN' | 'OPTED_OUT') => {
    setBusy(true)
    try {
      setConsent(await zaloCall<ZaloConsent>(url, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ status, source: 'OFFICER' }) }))
      toast.success(status === 'OPTED_IN' ? 'Đã cho phép hộ nhận tin Zalo.' : 'Đã tắt tin Zalo của hộ.')
    } catch {
      toast.error('Không ghi nhận được. Thử lại sau.')
    } finally {
      setBusy(false)
    }
  }

  const status = consent?.status ?? null

  return (
    <section className={kit.card} aria-labelledby="zalo-consent-title">
      <div className={styles.body}>
        <h2 id="zalo-consent-title" className={styles.title}>Nhận tin Zalo</h2>
        {failed && <p role="alert" className={kit.error}>Không tải được trạng thái nhận tin.</p>}
        {!failed && !loaded && <p className={kit.state}>Đang tải...</p>}
        {!failed && loaded && (
          <>
            <p className={styles.status}>{status ? STATUS_TEXT[status] : 'Chưa ghi nhận'}</p>
            {consent?.at && consent.source && (
              <p className={styles.meta}>Cập nhật lúc {formatVn(consent.at)} · {CONSENT_SOURCE_LABELS[consent.source]}</p>
            )}
            <div className={styles.actions}>
              <button type="button" className={kit.primary} disabled={busy || status === 'OPTED_IN'} onClick={() => record('OPTED_IN')}>
                Cho phép nhận tin
              </button>
              <button type="button" className={kit.secondary} disabled={busy || status === 'OPTED_OUT'} onClick={() => record('OPTED_OUT')}>
                Tắt nhận tin
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
