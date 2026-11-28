// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import kit from '@/components/features/farmer-web/kit.module.css'
import styles from './zalo.module.css'
import type { ZaloConsent } from '@/lib/zalo/zalo-types'

const LABEL: Record<string, string> = {
  OPTED_IN: 'Đang nhận',
  OPTED_OUT: 'Đã tắt',
}

/** The farmer can only turn Zalo messages off for their own household; turning them on is up to the cooperative. */
export function FarmerZaloOptOut({ householdId }: { householdId: string }) {
  const url = `/api/households/${encodeURIComponent(householdId)}/zalo-consent`
  const [consent, setConsent] = useState<ZaloConsent | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error('load')
        const body = (await res.json()) as ZaloConsent | null
        if (active) setConsent(body)
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
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'OPTED_OUT', source: 'MEMBER' }),
      })
      if (!res.ok) throw new Error('record')
      setConsent({ status: 'OPTED_OUT', at: new Date().toISOString(), recorded_by_name: null })
      setFailed(false)
      toast.success('Đã tắt tin Zalo của hộ.')
    } catch {
      toast.error('Không tắt được. Thử lại sau.')
    } finally {
      setBusy(false)
    }
  }

  const label = !loaded || failed ? '…' : consent ? LABEL[consent.status] ?? consent.status : 'Chưa ghi nhận'

  return (
    <section className={kit.pn} aria-labelledby="farmer-zalo-title">
      <div className={kit.ph}><h2 id="farmer-zalo-title">Nhận tin Zalo: {label}</h2></div>
      <div className={styles.farmerBody}>
        {failed && <p role="alert" className={kit.muted}>Không tải được trạng thái nhận tin.</p>}
        {!failed && !loaded && <p className={kit.muted}>Đang tải...</p>}
        {!failed && loaded && consent?.status === 'OPTED_OUT' && (
          <p className={kit.muted}>HTX sẽ không gửi tin Zalo cho hộ của bạn. Nhờ cán bộ HTX nếu muốn nhận lại.</p>
        )}
        {!failed && loaded && (
          <button type="button" className={kit.btn} disabled={busy || consent?.status === 'OPTED_OUT'} onClick={optOut}>
            Tắt nhận tin
          </button>
        )}
      </div>
    </section>
  )
}
