// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import kit from '@/components/features/farmer-web/kit.module.css'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import { formatVnd } from '@/lib/ledger/money'
import type { ReceivablesSummary, SalesKind, SalesOrderView } from '@/lib/sales/types'
import { dayMonthYear } from '@/lib/weighing/format'
import styles from './sales.module.css'

interface Partner {
  id: string
  name: string
}

const KIND_LABELS: Record<SalesKind, string> = { WHOLESALE: 'Bán sỉ', RETAIL: 'Bán lẻ' }

interface Props {
  /** "/manager" or "/accountant": the order links point into the caller's own area. */
  basePath: string
  /** The "Quá hạn" chip starts on when the page was opened from the board's overdue alert (?overdue=1). */
  initialOverdue: boolean
}

/** Wholesale and retail orders with filters, paging, the outstanding total and the receivables by partner. */
export function SalesListPanel({ basePath, initialOverdue }: Props) {
  const [kind, setKind] = useState<'' | SalesKind>('')
  const [status, setStatus] = useState<'' | 'CONFIRMED' | 'CANCELLED'>('')
  const [overdue, setOverdue] = useState(initialOverdue)
  const [partnerId, setPartnerId] = useState('')
  const [partners, setPartners] = useState<Partner[] | null>(null)
  const [orders, setOrders] = useState<SalesOrderView[] | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [receivables, setReceivables] = useState<ReceivablesSummary | null>(null)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchJson<{ data: Partner[] }>('/api/partners')
      .then(body => setPartners(body.data))
      .catch(() => setPartners(null))
    fetchJson<ReceivablesSummary>('/api/sales/receivables')
      .then(body => setReceivables(body))
      .catch(() => setReceivables(null))
  }, [])

  function query(cursor?: string): string {
    const params = new URLSearchParams()
    if (kind) params.set('kind', kind)
    if (status) params.set('status', status)
    if (overdue) params.set('overdue', '1')
    if (partnerId) params.set('partner_id', partnerId)
    if (cursor) params.set('cursor', cursor)
    return `/api/sales/orders?${params.toString()}`
  }

  useEffect(() => {
    setLoadError('')
    fetchJson<{ data: SalesOrderView[]; next_cursor: string | null }>(query())
      .then(body => { setOrders(body.data); setNextCursor(body.next_cursor) })
      .catch(() => { setOrders(null); setLoadError(LOAD_FAILED_MESSAGE) })
    // query() reads the filters above, which are the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, status, overdue, partnerId])

  async function loadMore() {
    if (!nextCursor) return
    setBusy(true)
    try {
      const body = await fetchJson<{ data: SalesOrderView[]; next_cursor: string | null }>(query(nextCursor))
      setOrders(prev => [...(prev ?? []), ...body.data])
      setNextCursor(body.next_cursor)
    } catch {
      setLoadError(LOAD_FAILED_MESSAGE)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.listLayout}>
      <section className={kit.pn} aria-labelledby="sales-list-title">
        <div className={kit.ph}>
          <h2 id="sales-list-title">Đơn bán</h2>
          <a className={styles.jumpLink} href="#receivables">Công nợ thương lái</a>
          <Link href={`${basePath}/sales/new`} className={styles.primaryLink}>Đơn bán sỉ mới</Link>
        </div>
        <div className={`${styles.filters} ${styles.pad}`}>
          <label className={kit.fl}>
            Loại
            <select className={kit.inp} value={kind} onChange={e => setKind(e.target.value as '' | SalesKind)}>
              <option value="">Tất cả</option>
              <option value="WHOLESALE">Bán sỉ</option>
              <option value="RETAIL">Bán lẻ</option>
            </select>
          </label>
          <label className={kit.fl}>
            Trạng thái
            <select className={kit.inp} value={status} onChange={e => setStatus(e.target.value as '' | 'CONFIRMED' | 'CANCELLED')}>
              <option value="">Tất cả</option>
              <option value="CONFIRMED">Đã xác nhận</option>
              <option value="CANCELLED">Đã huỷ</option>
            </select>
          </label>
          {partners && (
            <label className={kit.fl}>
              Đối tác
              <select className={kit.inp} value={partnerId} onChange={e => setPartnerId(e.target.value)}>
                <option value="">Tất cả</option>
                {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}
          <Button variant={overdue ? 'primary' : 'secondary'} size="sm" aria-pressed={overdue} onClick={() => setOverdue(v => !v)}>Quá hạn</Button>
        </div>
        {loadError && <p role="alert" className={`${styles.error} ${styles.pad}`}>{loadError}</p>}
        {!loadError && orders === null && <p className={`${kit.muted} ${styles.pad}`}>Đang tải đơn bán...</p>}
        {orders?.length === 0 && <p className={`${kit.muted} ${styles.pad}`}>Chưa có đơn bán nào với bộ lọc này.</p>}
        {orders && orders.length > 0 && (
          <ul className={kit.list}>
            {orders.map(o => (
              <li key={o.id} className={styles.row}>
                <div className={styles.grow}>
                  <Link href={`${basePath}/sales/${o.id}`} className={styles.link}><strong>{o.order_no}</strong></Link>
                  <span className={kit.muted}>
                    {KIND_LABELS[o.kind]} · {o.partner_name ?? o.customer_name ?? 'Khách lẻ'} · {dayMonthYear(o.ordered_on)}
                    {o.due_on ? ` · hạn ${dayMonthYear(o.due_on)}` : ''}
                  </span>
                  <span>{formatVnd(o.total_vnd)} đ · còn phải thu {formatVnd(o.outstanding_vnd)} đ</span>
                </div>
                <div className={styles.badges}>
                  <span className={kit.tag}>{o.status === 'CANCELLED' ? 'Đã huỷ' : 'Đã xác nhận'}</span>
                  {o.overdue && <span className={styles.overdue}>Quá hạn</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {nextCursor && (
          <div className={`${styles.pad} ${styles.center}`}>
            <Button variant="secondary" isLoading={busy} onClick={loadMore}>Tải thêm</Button>
          </div>
        )}
      </section>

      <section className={kit.pn} id="receivables" aria-labelledby="receivables-title">
        <div className={kit.ph}><h2 id="receivables-title">Công nợ thương lái</h2></div>
        {receivables === null && <p role="status" className={`${styles.pad} ${styles.error}`}>Chưa tải được công nợ.</p>}
        {receivables && (
          <div className={styles.pad}>
            <p className={styles.bigLine}>Còn phải thu: <strong>{formatVnd(receivables.outstanding_vnd)} đ</strong></p>
            <p className={receivables.overdue_count > 0 ? styles.error : kit.muted}>
              {receivables.overdue_count} đơn quá hạn · {formatVnd(receivables.overdue_vnd)} đ
            </p>
            {receivables.partners.length === 0 && <p className={kit.muted}>Không có khoản phải thu.</p>}
            <ul className={styles.plainList}>
              {receivables.partners.map(p => (
                <li key={p.partner_id} className={styles.partnerRow}>
                  <span>{p.partner_name}</span>
                  <span>{formatVnd(p.outstanding_vnd)} đ{BigInt(p.overdue_vnd) > BigInt(0) ? ` · quá hạn ${formatVnd(p.overdue_vnd)} đ` : ''}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  )
}
