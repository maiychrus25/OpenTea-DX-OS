// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import kit from '@/components/features/farmer-web/kit.module.css'
import { localDay } from '@/domain/shared/local-day'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import { money } from '@/lib/weighing/format'
import type { LeafTicket, LeafTicketPage } from '@/lib/weighing/types'
import styles from './weighing.module.css'

const REASON_MIN = 3
const REASON_MAX = 200
const kg = (value: number | string) => Number(value).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

interface Props {
  /** Bumped after each saved or voided ticket, so the list reloads. */
  revision: number
}

export function TodayTickets({ revision }: Props) {
  const [page, setPage] = useState<LeafTicketPage | null>(null)
  const [loadError, setLoadError] = useState('')
  const [voiding, setVoiding] = useState<LeafTicket | null>(null)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [voidError, setVoidError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => fetchJson<LeafTicketPage>(`/api/leaf-tickets?date=${localDay(new Date())}`)
    .then(body => { setPage(body); setLoadError('') })
    .catch(() => setLoadError(LOAD_FAILED_MESSAGE))

  useEffect(() => { void load() }, [revision])

  function openVoid(ticket: LeafTicket) {
    setVoiding(ticket)
    setReason('')
    setReasonError('')
    setVoidError('')
  }

  async function confirmVoid() {
    if (!voiding) return
    const text = reason.trim()
    if (text.length < REASON_MIN || text.length > REASON_MAX) {
      setReasonError(`Nhập lý do huỷ từ ${REASON_MIN} đến ${REASON_MAX} ký tự.`)
      return
    }
    setBusy(true)
    setVoidError('')
    try {
      const res = await fetch(`/api/leaf-tickets/${voiding.id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: text }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setVoidError(body?.error?.message || 'Không huỷ được phiếu. Vui lòng thử lại.'); return }
      setVoiding(null)
      void load()
    } catch {
      setVoidError('Lỗi kết nối máy chủ.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={kit.pn} aria-labelledby="today-tickets-title">
      <div className={kit.ph}><h2 id="today-tickets-title">Phiếu hôm nay</h2></div>
      {loadError && <p role="alert" className={`${styles.error} ${styles.pad}`}>{loadError}</p>}
      {page && (
        <>
          <dl className={`${styles.totals} ${styles.pad}`}>
            <div><dt>Tổng kg tịnh</dt><dd>{kg(page.totals.net_kg)} kg</dd></div>
            <div><dt>Thành tiền</dt><dd>{money(page.totals.amount_vnd)} đ</dd></div>
          </dl>
          {page.data.length === 0 && <p className={`${kit.muted} ${styles.pad}`}>Chưa có phiếu nào hôm nay.</p>}
          <ul className={kit.list}>
            {page.data.map(t => (
              <li key={t.id} className={styles.ticketRow}>
                <div className={styles.grow}>
                  <strong>{t.ticket_no}</strong>
                  <span className={kit.muted}>{t.household_name} · {t.parcel_code} · {t.grade_name}</span>
                  <span>{kg(t.net_kg)} kg · {money(t.amount_vnd)} đ</span>
                </div>
                {t.status === 'VOIDED'
                  ? <span className={kit.tag}>Đã huỷ</span>
                  : !t.settlement_id && (
                    <Button size="sm" variant="secondary" aria-label={`Huỷ phiếu ${t.ticket_no}`} onClick={() => openVoid(t)}>Huỷ phiếu</Button>
                  )}
              </li>
            ))}
          </ul>
        </>
      )}

      <Modal isOpen={!!voiding} onClose={() => setVoiding(null)} title="Huỷ phiếu cân" size="sm">
        <p>Phiếu {voiding?.ticket_no}. Phiếu đã huỷ không sửa lại được; cần lập phiếu mới.</p>
        <label className={kit.fl}>
          Lý do huỷ
          <textarea className={kit.inp} rows={3} maxLength={REASON_MAX} value={reason} onChange={e => setReason(e.target.value)} aria-invalid={!!reasonError} />
        </label>
        {reasonError && <p role="alert" className={styles.error}>{reasonError}</p>}
        {voidError && <p role="alert" className={styles.error}>{voidError}</p>}
        <div className={styles.modalActions}>
          <Button variant="secondary" onClick={() => setVoiding(null)}>Hủy</Button>
          <Button variant="danger" isLoading={busy} onClick={confirmVoid}>Xác nhận huỷ</Button>
        </div>
      </Modal>
    </section>
  )
}
