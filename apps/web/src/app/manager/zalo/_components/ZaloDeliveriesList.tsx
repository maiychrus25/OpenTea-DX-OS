// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import kit from '@/components/features/dashboard/page-kit.module.css'
import styles from '@/components/features/zalo/zalo.module.css'
import { LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import {
  DELIVERY_STATUS_LABELS,
  ZALO_EVENT_KINDS,
  ZALO_KIND_LABELS,
  maskPhone,
  type ZaloDelivery,
  type ZaloDeliveryPage,
} from '@/lib/zalo/zalo-types'

const deliveriesUrl = (status: string, kind: string, cursor?: string) => {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (kind) params.set('kind', kind)
  if (cursor) params.set('cursor', cursor)
  const query = params.toString()
  return `/api/zalo/deliveries${query ? `?${query}` : ''}`
}

export function ZaloDeliveriesList() {
  const [status, setStatus] = useState('')
  const [kind, setKind] = useState('')
  const [rows, setRows] = useState<ZaloDelivery[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  // A filter change starts again from the first page.
  useEffect(() => {
    let active = true
    setLoaded(false)
    setFailed(false)
    fetch(deliveriesUrl(status, kind))
      .then(async (res) => {
        if (!res.ok) throw new Error('load')
        const page = (await res.json()) as ZaloDeliveryPage
        if (!active) return
        setRows(page.data)
        setNextCursor(page.next_cursor)
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
  }, [status, kind])

  const loadMore = async () => {
    if (!nextCursor) return
    setLoadingMore(true)
    try {
      const res = await fetch(deliveriesUrl(status, kind, nextCursor))
      if (!res.ok) throw new Error('more')
      const page = (await res.json()) as ZaloDeliveryPage
      setRows((prev) => [...prev, ...page.data])
      setNextCursor(page.next_cursor)
    } catch {
      setFailed(true)
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <section className={kit.card} aria-labelledby="zalo-deliveries-title">
      <div className={styles.body}>
        <h2 id="zalo-deliveries-title" className={styles.title}>Lịch sử gửi tin</h2>
        <div className={styles.filters}>
          <label className={styles.field}>
            Trạng thái
            <select className={styles.select} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Tất cả</option>
              {Object.entries(DELIVERY_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            Loại tin
            <select className={styles.select} value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">Tất cả</option>
              {ZALO_EVENT_KINDS.map((k) => (
                <option key={k} value={k}>{ZALO_KIND_LABELS[k]}</option>
              ))}
            </select>
          </label>
        </div>

        {failed && <p role="alert" className={kit.error}>{LOAD_FAILED_MESSAGE}</p>}
        {!failed && !loaded && <p className={kit.state}>Đang tải...</p>}
        {!failed && loaded && rows.length === 0 && <p className={kit.state}>Chưa có tin nào.</p>}
        {!failed && loaded && rows.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Thời điểm</th>
                  <th scope="col">Loại tin</th>
                  <th scope="col">Số điện thoại</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">Lỗi</th>
                  <th scope="col">Gửi lúc</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.created_at).toLocaleString('vi-VN')}</td>
                    <td>{ZALO_KIND_LABELS[row.event_kind] ?? row.event_kind}</td>
                    <td>{maskPhone(row.phone_masked)}</td>
                    <td>{DELIVERY_STATUS_LABELS[row.status] ?? row.status}</td>
                    <td>{row.last_error_vi ?? '—'}</td>
                    <td>{row.sent_at ? new Date(row.sent_at).toLocaleString('vi-VN') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {nextCursor && (
          <div className={styles.actions}>
            <button type="button" className={kit.secondary} disabled={loadingMore} onClick={loadMore}>Tải thêm</button>
          </div>
        )}
      </div>
    </section>
  )
}
