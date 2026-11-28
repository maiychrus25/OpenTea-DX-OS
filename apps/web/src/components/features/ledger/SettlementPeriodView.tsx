// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import Link from 'next/link'
import React, { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import kit from '@/components/features/farmer-web/kit.module.css'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import { formatVnd } from '@/lib/ledger/money'
import type { SettlementDetail, SettlementLine, SettlementPeriod, SettlementTotals } from '@/lib/ledger/types'
import { dayMonthYear } from '@/lib/weighing/format'
import styles from './ledger.module.css'

const METHOD_LABELS: Record<'TRANSFER' | 'CASH', string> = { TRANSFER: 'Chuyển khoản', CASH: 'Tiền mặt' }
const kg = (value: number | string) => Number(value).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const isZero = (vnd: string) => BigInt(vnd) === BigInt(0)

/** The sentence the manager confirms before closing (spec §4.5), with the numbers it is about. */
export function closeConfirmText(period: SettlementPeriod, totals: SettlementTotals): string {
  return `Chốt kỳ ${period.code}: ${totals.households} hộ, tổng thực lĩnh ${formatVnd(totals.payable_vnd)} đ. Sau khi chốt không sửa được phiếu cân và phiếu ứng trong kỳ.`
}

interface Props {
  periodId: string
  /** Only the manager sees the close button; the accountant prepares and pays. */
  canClose: boolean
  /** Where the slip links go, e.g. "/manager". */
  basePath: string
}

/** A settlement period: the draft preview with its close, or the closed lines with their payouts. */
export function SettlementPeriodView({ periodId, canClose, basePath }: Props) {
  const [detail, setDetail] = useState<SettlementDetail | null>(null)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')

  const [closing, setClosing] = useState(false)
  const [closeTotals, setCloseTotals] = useState<SettlementTotals | null>(null)
  const [changed, setChanged] = useState(false)
  const [closeError, setCloseError] = useState('')
  const [closeBusy, setCloseBusy] = useState(false)

  const [paying, setPaying] = useState<SettlementLine | null>(null)
  const [method, setMethod] = useState<'TRANSFER' | 'CASH'>('TRANSFER')
  const [ref, setRef] = useState('')
  const [payError, setPayError] = useState('')
  const [payBusy, setPayBusy] = useState(false)

  const load = useCallback(() => fetchJson<{ data: SettlementDetail }>(`/api/settlements/${periodId}`)
    .then(body => { setDetail(body.data); setLoadError('') })
    .catch(() => setLoadError(LOAD_FAILED_MESSAGE)), [periodId])

  useEffect(() => { void load() }, [load])

  function openClose() {
    if (!detail) return
    setCloseTotals(detail.totals)
    setChanged(false)
    setCloseError('')
    setClosing(true)
  }

  /** Sends the numbers the dialog shows. Never called by itself: only the button calls it. */
  async function confirmClose() {
    if (!detail || !closeTotals) return
    setCloseBusy(true)
    setCloseError('')
    try {
      const res = await fetch(`/api/settlements/${periodId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expected_household_count: closeTotals.households, expected_payable_total_vnd: closeTotals.payable_vnd }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        setClosing(false)
        setNotice('Kỳ đã được chốt.')
        void load()
        return
      }
      if (json?.error?.code === 'PERIOD_CHANGED') {
        // The numbers moved after the dialog opened: show the new ones; the manager must confirm again.
        setCloseTotals(json.error.totals)
        setChanged(true)
        return
      }
      if (json?.error?.code === 'PERIOD_CLOSED') {
        setClosing(false)
        setNotice('Kỳ này đã được chốt trước đó.')
        void load()
        return
      }
      setCloseError(json?.error?.message || 'Không chốt được kỳ. Vui lòng thử lại.')
    } catch {
      setCloseError('Lỗi kết nối máy chủ.')
    } finally {
      setCloseBusy(false)
    }
  }

  function openPay(line: SettlementLine) {
    setPaying(line)
    setMethod('TRANSFER')
    setRef('')
    setPayError('')
  }

  async function confirmPay() {
    if (!paying?.id) return
    setPayBusy(true)
    setPayError('')
    try {
      const res = await fetch(`/api/settlements/${periodId}/lines/${paying.id}/payout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, ...(ref.trim() ? { ref: ref.trim() } : {}) }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setPayError(json?.error?.message || 'Không ghi được chi trả.'); return }
      setPaying(null)
      setNotice('Đã ghi chi trả.')
      void load()
    } catch {
      setPayError('Lỗi kết nối máy chủ.')
    } finally {
      setPayBusy(false)
    }
  }

  if (loadError) return <p role="alert" className={styles.error}>{loadError}</p>
  if (!detail) return <p className={kit.muted}>Đang tải kỳ quyết toán...</p>

  const { period, lines, totals } = detail
  const closed = period.status === 'CLOSED'

  return (
    <>
      <section className={kit.pn} aria-labelledby="period-title">
        <div className={kit.ph}>
          <h2 id="period-title">{period.code}</h2>
          <span className={kit.tag}>{closed ? 'Đã chốt' : 'Nháp'}</span>
          {!closed && canClose && <Button size="sm" onClick={openClose}>Chốt kỳ</Button>}
        </div>
        <p className={`${kit.muted} ${styles.pad}`}>
          Từ {dayMonthYear(period.date_from)} đến {dayMonthYear(period.date_to)}
          {closed && period.closed_by_name ? ` · Chốt bởi ${period.closed_by_name}` : ''}
        </p>
        {notice && <p role="status" className={`${styles.status} ${styles.pad}`}>{notice}</p>}

        {lines.length === 0 ? (
          <p className={`${kit.muted} ${styles.pad}`}>Kỳ này chưa có phiếu cân hay phiếu ứng nào.</p>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Hộ</th><th>Kg búp</th><th>Tiền búp</th><th>Vật tư</th><th>Nợ kỳ trước</th><th>Thực lĩnh</th><th>Nợ chuyển</th>
                  {closed && <th>Trả tiền</th>}
                  {closed && <th aria-label="Thao tác" />}
                </tr>
              </thead>
              <tbody>
                {lines.map(line => (
                  <tr key={line.household_id}>
                    <td>{line.household_name}</td>
                    <td>{kg(line.leaf_net_kg)}</td>
                    <td>{formatVnd(line.leaf_amount_vnd)} đ</td>
                    <td>{formatVnd(line.advances_vnd)} đ</td>
                    <td>{formatVnd(line.debt_in_vnd)} đ</td>
                    <td><strong>{formatVnd(line.payable_vnd)} đ</strong></td>
                    <td>{formatVnd(line.debt_out_vnd)} đ</td>
                    {closed && (
                      <td>
                        {isZero(line.payable_vnd) ? 'Không có khoản chi trả'
                          : line.paid_at ? `Đã trả · ${line.payment_method ? METHOD_LABELS[line.payment_method] : ''}${line.payment_ref ? ` · ${line.payment_ref}` : ''}`
                          : 'Chưa trả'}
                      </td>
                    )}
                    {closed && (
                      <td className={styles.rowActions}>
                        {line.id && <Link href={`${basePath}/settlements/${periodId}/slip/${line.id}`} className={styles.link}>Phiếu</Link>}
                        {line.id && !isZero(line.payable_vnd) && !line.paid_at && (
                          <Button size="sm" variant="secondary" aria-label={`Ghi đã trả ${line.household_name}`} onClick={() => openPay(line)}>Ghi đã trả</Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>Tổng ({totals.households} hộ)</th><th /><th>{formatVnd(totals.leaf_amount_vnd)} đ</th><th>{formatVnd(totals.advances_vnd)} đ</th><th />
                  <th>{formatVnd(totals.payable_vnd)} đ</th><th>{formatVnd(totals.debt_out_vnd)} đ</th>
                  {closed && <th />}{closed && <th />}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {!closed && <p className={`${styles.pad} ${kit.muted}`}>Chờ trưởng HTX chốt</p>}
      </section>

      <Modal isOpen={closing} onClose={() => setClosing(false)} title="Xác nhận chốt kỳ" size="sm">
        {closeTotals && <p>{closeConfirmText(period, closeTotals)}</p>}
        {changed && <p role="alert" className={styles.error}>Số liệu đã thay đổi sau khi bạn mở hộp xác nhận. Kiểm tra số mới rồi xác nhận lại.</p>}
        {closeError && <p role="alert" className={styles.error}>{closeError}</p>}
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => setClosing(false)}>Hủy</Button>
          <Button isLoading={closeBusy} onClick={confirmClose}>Xác nhận chốt kỳ</Button>
        </div>
      </Modal>

      <Modal isOpen={!!paying} onClose={() => setPaying(null)} title="Ghi đã trả" size="sm">
        <p>{paying?.household_name}: {paying ? formatVnd(paying.payable_vnd) : ''} đ</p>
        <div className={styles.formGrid}>
          <label className={kit.fl}>
            Hình thức
            <select className={kit.inp} value={method} onChange={e => setMethod(e.target.value as 'TRANSFER' | 'CASH')}>
              <option value="TRANSFER">{METHOD_LABELS.TRANSFER}</option>
              <option value="CASH">{METHOD_LABELS.CASH}</option>
            </select>
          </label>
          <label className={kit.fl}>
            Mã tham chiếu (tuỳ chọn)
            <input className={kit.inp} maxLength={100} value={ref} onChange={e => setRef(e.target.value)} />
          </label>
        </div>
        {payError && <p role="alert" className={styles.error}>{payError}</p>}
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => setPaying(null)}>Hủy</Button>
          <Button isLoading={payBusy} onClick={confirmPay}>Ghi đã trả</Button>
        </div>
      </Modal>
    </>
  )
}
