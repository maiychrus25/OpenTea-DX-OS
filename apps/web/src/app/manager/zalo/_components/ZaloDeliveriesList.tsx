// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import { Mail } from 'lucide-react'
import kit from '@/components/features/dashboard/page-kit.module.css'
import styles from './zalo-head.module.css'
import table from '@/components/features/dashboard/dashboard.module.css'
import { DELIVERY_STATUS_LABELS, ZALO_EVENT_KINDS, ZALO_KIND_LABELS, type ZaloDelivery } from '@/lib/zalo/zalo-types'
import { formatVn, zaloCall } from '@/lib/zalo/zalo-api'

/** The newest 100 messages of the cooperative. The server sends no cursor, so there is no paging. */
export function ZaloDeliveriesList() {
  const [status, setStatus] = useState('')
  const [kind, setKind] = useState('')
  const [rows, setRows] = useState<ZaloDelivery[]>([])
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (kind) params.set('kind', kind)
    const query = params.toString()
    setLoaded(false)
    setFailed(false)
    zaloCall<ZaloDelivery[]>(`/api/zalo/deliveries${query ? `?${query}` : ''}`)
      .then((data) => {
        if (active) setRows(data)
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

  return (
    <section className={styles.card} aria-labelledby="zalo-deliveries-title">
        <div className={styles.head}>
          <h2 id="zalo-deliveries-title" className={styles.title}>Lịch sử gửi tin</h2>
          <select className={styles.select} aria-label="Trạng thái" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Trạng thái: Tất cả</option>
            {Object.entries(DELIVERY_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select className={styles.select} aria-label="Loại tin" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">Loại tin: Tất cả</option>
            {ZALO_EVENT_KINDS.map((k) => (
              <option key={k} value={k}>{ZALO_KIND_LABELS[k]}</option>
            ))}
          </select>
        </div>

        {failed && <p role="alert" className={kit.error}>Không tải được lịch sử gửi tin.</p>}
        {!failed && !loaded && <p className={kit.state}>Đang tải...</p>}
        {!failed && loaded && rows.length === 0 && (
          <div className={styles.empty}>
            <span aria-hidden="true"><Mail size={30} /></span>
            <strong>Chưa có tin nào.</strong>
            <small>Khi có tin được gửi, lịch sử sẽ hiển thị tại đây.</small>
          </div>
        )}
        {!failed && loaded && rows.length > 0 && (
          <div className={table.tableWrap}>
            <table className={table.table}>
              <thead>
                <tr>
                  <th scope="col">Thời điểm</th>
                  <th scope="col">Loại tin</th>
                  <th scope="col">Số điện thoại</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">Lý do</th>
                  <th scope="col">Gửi lúc</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatVn(row.created_at)}</td>
                    <td>{ZALO_KIND_LABELS[row.kind] ?? row.kind}</td>
                    <td>{row.phone_masked}</td>
                    <td>{DELIVERY_STATUS_LABELS[row.status] ?? row.status}</td>
                    <td>{row.reason_vi ?? '—'}</td>
                    <td>{row.sent_at ? formatVn(row.sent_at) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </section>
  )
}
