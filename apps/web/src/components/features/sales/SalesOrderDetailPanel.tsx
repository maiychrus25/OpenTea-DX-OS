// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import Link from 'next/link'
import React, { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import kit from '@/components/features/farmer-web/kit.module.css'
import { localDay } from '@/domain/shared/local-day'
import { LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import { formatVnd } from '@/lib/ledger/money'
import { gramsText, sumVnd } from '@/lib/sales/format'
import { salesErrorText } from '@/lib/sales/errors'
import type { SalesOrderView, SalesPaymentMethod } from '@/lib/sales/types'
import { dayMonthYear } from '@/lib/weighing/format'
import styles from './sales.module.css'

const METHOD_LABELS: Record<SalesPaymentMethod, string> = { TRANSFER: 'Chuyển khoản', CASH: 'Tiền mặt' }
const REASON_MIN = 3
const REASON_MAX = 200

interface Props {
  orderId: string
  /** "/manager" or "/accountant". */
  basePath: string
  /** Only the manager cancels an order. */
  canCancel: boolean
}

/** One sales order: lines, payments, the actions the rules allow, and the A5 delivery note. */
export function SalesOrderDetailPanel({ orderId, basePath, canCancel }: Props) {
  const [order, setOrder] = useState<SalesOrderView | null>(null)
  const [missing, setMissing] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const [amount, setAmount] = useState('')
  const [paidOn, setPaidOn] = useState(localDay(new Date()))
  const [method, setMethod] = useState<SalesPaymentMethod>('TRANSFER')
  const [ref, setRef] = useState('')
  const [dueOn, setDueOn] = useState('')
  const [reason, setReason] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/sales/orders/${orderId}`)
      if (res.status === 404) { setMissing(true); return }
      if (!res.ok) throw new Error('load')
      const body = await res.json()
      setOrder(body.data)
      setDueOn(body.data.due_on ?? '')
      setAmount(body.data.outstanding_vnd)
      setLoadError('')
    } catch {
      setLoadError(LOAD_FAILED_MESSAGE)
    }
  }, [orderId])

  useEffect(() => { void load() }, [load])

  /** Runs one action, shows its error by code, and takes the order the server answers with. */
  async function act(url: string, method: 'POST' | 'PATCH', body: object, done: string, fallback: string): Promise<boolean> {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(salesErrorText(json?.error?.code, json?.error?.message, fallback)); return false }
      setOrder(json.data)
      setDueOn(json.data.due_on ?? '')
      setAmount(json.data.outstanding_vnd)
      setNotice(done)
      return true
    } catch {
      setError('Lỗi kết nối máy chủ.')
      return false
    } finally {
      setBusy(false)
    }
  }

  if (missing) return <p role="alert" className={styles.error}>{salesErrorText('NOT_FOUND', undefined, 'Không tìm thấy đơn này.')}</p>
  if (loadError) return <p role="alert" className={styles.error}>{loadError}</p>
  if (!order) return <p className={kit.muted}>Đang tải đơn bán...</p>

  const confirmed = order.status === 'CONFIRMED'
  const hasOutstanding = BigInt(order.outstanding_vnd) > BigInt(0)
  const wholesale = order.kind === 'WHOLESALE'
  const paidTotal = sumVnd(order.payments.map(p => p.amount_vnd))

  function recordPayment() {
    if (!/^\d{1,15}$/.test(amount) || BigInt(amount) <= BigInt(0)) { setError('Nhập số tiền thu là số nguyên lớn hơn 0.'); return }
    if (BigInt(amount) > BigInt(order!.outstanding_vnd)) { setError('Số tiền thu vượt quá số còn phải thu của đơn.'); return }
    void act(`/api/sales/orders/${orderId}/payments`, 'POST', {
      amount_vnd: amount, paid_on: paidOn, method, ...(ref.trim() ? { ref: ref.trim() } : {}),
    }, 'Đã ghi thu tiền.', 'Không ghi được thu tiền.').then(ok => { if (ok) setRef('') })
  }

  function changeDue() {
    if (!dueOn || dueOn < order!.ordered_on) { setError('Hạn thanh toán không được trước ngày lập đơn.'); return }
    void act(`/api/sales/orders/${orderId}`, 'PATCH', { due_on: dueOn }, 'Đã đổi hạn thanh toán.', 'Không đổi được hạn thanh toán.')
  }

  function cancel() {
    const text = reason.trim()
    if (text.length < REASON_MIN || text.length > REASON_MAX) { setError(`Nhập lý do huỷ từ ${REASON_MIN} đến ${REASON_MAX} ký tự.`); return }
    void act(`/api/sales/orders/${orderId}/cancel`, 'POST', { reason: text }, 'Đã huỷ đơn.', 'Không huỷ được đơn.')
  }

  return (
    <div className={styles.detailLayout}>
      <p><Link href={`${basePath}/sales`} className={styles.link}>← Đơn bán</Link></p>

      <section className={kit.pn} aria-labelledby="order-head-title">
        <div className={kit.ph}>
          <h2 id="order-head-title">{order.order_no}</h2>
          <span className={kit.tag}>{confirmed ? 'Đã xác nhận' : 'Đã huỷ'}</span>
          {order.overdue && <span className={styles.overdue}>Quá hạn</span>}
        </div>
        <p className={`${kit.muted} ${styles.pad}`}>
          {wholesale ? 'Bán sỉ' : 'Bán lẻ'} · {order.partner_name ?? order.customer_name ?? 'Khách lẻ'} · lập ngày {dayMonthYear(order.ordered_on)}
          {order.due_on ? ` · hạn thanh toán ${dayMonthYear(order.due_on)}` : ''}
        </p>
        {order.note && <p className={styles.pad}>{order.note}</p>}
        {order.status === 'CANCELLED' && <p role="status" className={`${styles.pad} ${styles.error}`}>Đã huỷ: {order.cancel_reason}</p>}
        <dl className={`${styles.metrics} ${styles.pad}`}>
          <div><dt>Tổng tiền</dt><dd>{formatVnd(order.total_vnd)} đ</dd></div>
          <div><dt>Đã thu</dt><dd>{formatVnd(order.paid_vnd)} đ</dd></div>
          <div><dt>Còn phải thu</dt><dd>{formatVnd(order.outstanding_vnd)} đ</dd></div>
        </dl>
      </section>

      <section className={kit.pn} aria-labelledby="order-lines-title">
        <div className={kit.ph}><h2 id="order-lines-title">Các dòng</h2></div>
        <ul className={kit.list}>
          {order.lines.map(line => (
            <li key={line.id} className={styles.row}>
              <div className={styles.grow}>
                <strong>{line.lot_code}</strong>
                <span className={kit.muted}>
                  {line.pack_count !== null && line.pack_net_g !== null
                    ? `${line.pack_count} gói × ${line.pack_net_g} g = ${gramsText(line.net_g)}`
                    : gramsText(line.net_g)}
                  {line.price_vnd_per_kg !== null ? ` · ${line.price_vnd_per_kg.toLocaleString('vi-VN')} đ/kg` : ''}
                </span>
              </div>
              <strong>{formatVnd(line.amount_vnd)} đ</strong>
            </li>
          ))}
        </ul>
      </section>

      <section className={kit.pn} aria-labelledby="order-payments-title">
        <div className={kit.ph}><h2 id="order-payments-title">Các khoản thu</h2></div>
        {order.payments.length === 0 && <p className={`${kit.muted} ${styles.pad}`}>Chưa thu tiền lần nào.</p>}
        <ul className={kit.list}>
          {order.payments.map(p => (
            <li key={p.id} className={styles.row}>
              <div className={styles.grow}>
                <strong>{formatVnd(p.amount_vnd)} đ</strong>
                <span className={kit.muted}>{dayMonthYear(p.paid_on)} · {METHOD_LABELS[p.method]}{p.ref ? ` · ${p.ref}` : ''}</span>
              </div>
            </li>
          ))}
        </ul>
        {order.payments.length > 0 && <p className={`${kit.muted} ${styles.pad}`}>Tổng đã thu: {formatVnd(paidTotal)} đ</p>}

        {confirmed && hasOutstanding && (
          <div className={styles.form}>
            <h3 className={styles.subhead}>Ghi thu tiền</h3>
            <div className={styles.formGrid}>
              <label className={kit.fl}>Số tiền (đ)<input className={kit.inp} inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} /></label>
              <label className={kit.fl}>Ngày thu<input className={kit.inp} type="date" value={paidOn} onChange={e => setPaidOn(e.target.value)} /></label>
              <label className={kit.fl}>
                Hình thức
                <select className={kit.inp} value={method} onChange={e => setMethod(e.target.value as SalesPaymentMethod)}>
                  <option value="TRANSFER">{METHOD_LABELS.TRANSFER}</option>
                  <option value="CASH">{METHOD_LABELS.CASH}</option>
                </select>
              </label>
              <label className={kit.fl}>Mã tham chiếu (tuỳ chọn)<input className={kit.inp} maxLength={100} value={ref} onChange={e => setRef(e.target.value)} /></label>
            </div>
            <Button isLoading={busy} onClick={recordPayment}>Ghi thu tiền</Button>
          </div>
        )}
      </section>

      {confirmed && wholesale && (
        <section className={kit.pn} aria-labelledby="order-due-title">
          <div className={kit.ph}><h2 id="order-due-title">Hạn thanh toán</h2></div>
          <div className={styles.form}>
            <label className={kit.fl}>Hạn mới<input className={kit.inp} type="date" value={dueOn} min={order.ordered_on} onChange={e => setDueOn(e.target.value)} /></label>
            <Button variant="secondary" isLoading={busy} onClick={changeDue}>Đổi hạn thanh toán</Button>
          </div>
        </section>
      )}

      {confirmed && canCancel && (
        <section className={kit.pn} aria-labelledby="order-cancel-title">
          <div className={kit.ph}><h2 id="order-cancel-title">Huỷ đơn</h2></div>
          <div className={styles.form}>
            <label className={kit.fl}>Lý do huỷ<input className={kit.inp} maxLength={REASON_MAX} value={reason} onChange={e => setReason(e.target.value)} /></label>
            <Button variant="secondary" isLoading={busy} onClick={cancel}>Huỷ đơn</Button>
          </div>
        </section>
      )}

      {error && <p role="alert" className={`${styles.error} ${styles.pad}`}>{error}</p>}
      {notice && <p role="status" className={`${styles.status} ${styles.pad}`}>{notice}</p>}

      <section className={styles.deliveryNote} aria-labelledby="delivery-note-title">
        <div className={styles.noteActions}>
          <h2 id="delivery-note-title" className={styles.subhead}>Phiếu giao hàng</h2>
          <Button variant="secondary" onClick={() => window.print()}>In phiếu giao hàng</Button>
        </div>
        <div className={styles.printArea}>
          <h1 className={styles.noteTitle}>Phiếu giao hàng</h1>
          <p>Số đơn: {order.order_no} · Ngày: {dayMonthYear(order.ordered_on)}</p>
          <p>Bên mua: {order.partner_name ?? order.customer_name ?? 'Khách lẻ'}</p>
          <table className={styles.noteTable}>
            <thead><tr><th>Lô</th><th>Khối lượng</th><th>Thành tiền</th></tr></thead>
            <tbody>
              {order.lines.map(line => (
                <tr key={line.id}><td>{line.lot_code}</td><td>{gramsText(line.net_g)}</td><td>{formatVnd(line.amount_vnd)} đ</td></tr>
              ))}
            </tbody>
          </table>
          <p>Tổng tiền: {formatVnd(order.total_vnd)} đ</p>
          <div className={styles.signRow}>
            <span>Người giao</span>
            <span>Người nhận</span>
          </div>
        </div>
      </section>
    </div>
  )
}
