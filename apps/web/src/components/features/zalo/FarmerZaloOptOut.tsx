// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import kit from '@/components/features/farmer-web/kit.module.css'
import styles from './zalo.module.css'
import type { ZaloConsent } from '@/lib/zalo/zalo-types'
import { JSON_HEADERS, zaloCall } from '@/lib/zalo/zalo-api'

const LABEL: Record<'OPTED_IN' | 'OPTED_OUT', string> = {
  OPTED_IN: 'Đang nhận',
  OPTED_OUT: 'Đã tắt',
}
const RECOVER_HINT = 'Muốn nhận lại, báo cán bộ HTX.'

/** The farmer can only turn Zalo messages off for their own household. Turning them on is up to the cooperative. */
export function FarmerZaloOptOut({ householdId }: { householdId: string }) {
  const url = `/api/households/${encodeURIComponent(householdId)}/zalo-consent`
  const [consent, setConsent] = useState<ZaloConsent | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [confirming, setConfirming] = useState(false)
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

  const optOut = async () => {
    setBusy(true)
    try {
      setConsent(await zaloCall<ZaloConsent>(url, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ status: 'OPTED_OUT', source: 'MEMBER' }) }))
      setConfirming(false)
      toast.success('Đã tắt tin Zalo của hộ.')
    } catch {
      toast.error('Không tắt được. Thử lại sau.')
    } finally {
      setBusy(false)
    }
  }

  const status = consent?.status ?? null
  const label = !loaded || failed ? '…' : status ? LABEL[status] : 'Chưa đăng ký'

  return (
    <section className={kit.pn} aria-labelledby="farmer-zalo-title">
      <div className={kit.ph}><h2 id="farmer-zalo-title">Nhận tin Zalo: {label}</h2></div>
      <div className={styles.farmerBody}>
        {failed && <p role="alert" className={kit.muted}>Không tải được trạng thái nhận tin.</p>}
        {!failed && !loaded && <p className={kit.muted}>Đang tải...</p>}
        {!failed && loaded && status !== 'OPTED_IN' && <p className={kit.muted}>{RECOVER_HINT}</p>}
        {!failed && loaded && status === 'OPTED_IN' && !confirming && (
          <button type="button" className={kit.btn} disabled={busy} onClick={() => setConfirming(true)}>
            Tắt nhận tin
          </button>
        )}
        {!failed && loaded && status === 'OPTED_IN' && confirming && (
          <>
            <p className={kit.muted}>Hộ sẽ không nhận tin Zalo từ HTX nữa. Bạn chắc chắn muốn tắt?</p>
            <div className={styles.actions}>
              <button type="button" className={kit.btn} disabled={busy} onClick={optOut}>Xác nhận tắt</button>
              <button type="button" className={kit.btn2} disabled={busy} onClick={() => setConfirming(false)}>Huỷ</button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
