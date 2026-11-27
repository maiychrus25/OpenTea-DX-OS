// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import kit from '@/components/features/farmer-web/kit.module.css'
import { localDay } from '@/domain/shared/local-day'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import { formatVnd } from '@/lib/ledger/money'
import type { AdvancePage, InputAdvance } from '@/lib/ledger/types'
import styles from './ledger.module.css'

const REASON_MIN = 3
const REASON_MAX = 200

interface Props {
  /** Bumped after each saved advance, so the list reloads. */
  revision: number
}

/** Advances written today, each with a void that needs a reason. */
export function TodayAdvances({ revision }: Props) {
  const [page, setPage] = useState<AdvancePage | null>(null)
  const [loadError, setLoadError] = useState('')
  const [voiding, setVoiding] = useState<InputAdvance | null>(null)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [voidError, setVoidError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => {
    const today = localDay(new Date())
    return fetchJson<AdvancePage>(`/api/input-advances?from=${today}&to=${today}`)
      .then(body => { setPage(body); setLoadError('') })
      .catch(() => setLoadError(LOAD_FAILED_MESSAGE))
  }

  useEffect(() => { void load() }, [revision])

  function openVoid(advance: InputAdvance) {
    setVoiding(advance)
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
      const res = await fetch(`/api/input-advances/${voiding.id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: text }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setVoidError(json?.error?.message || 'Không huỷ được phiếu ứng.'); return }
      setVoiding(null)
      void load()
    } catch {
      setVoidError('Lỗi kết nối máy chủ.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={kit.pn} aria-labelledby="today-advances-title">
      <div className={kit.ph}><h2 id="today-advances-title">Phiếu ứng hôm nay</h2></div>
      {loadError && <p role="alert" className={`${styles.error} ${styles.pad}`}>{loadError}</p>}
      {page && (
        <>
          <p className={`${styles.pad} ${styles.total}`}>Tổng tiền ứng: <strong>{formatVnd(page.totals.amount_vnd)} đ</strong></p>
          {page.data.length === 0 && <p className={`${kit.muted} ${styles.pad}`}>Chưa có phiếu ứng nào hôm nay.</p>}
          <ul className={kit.list}>
            {page.data.map(a => (
              <li key={a.id} className={styles.row}>
                <div className={styles.grow}>
                  <strong>{a.advance_no}</strong>
                  <span className={kit.muted}>{a.household_name} · {a.item_name} · {String(a.quantity)} {a.unit}</span>
                  <span>{formatVnd(a.amount_vnd)} đ</span>
                </div>
                {a.status === 'VOIDED'
                  ? <span className={kit.tag}>Đã huỷ</span>
                  : !a.settlement_id && (
                    <Button size="sm" variant="secondary" aria-label={`Huỷ phiếu ${a.advance_no}`} onClick={() => openVoid(a)}>Huỷ phiếu</Button>
                  )}
              </li>
            ))}
          </ul>
        </>
      )}

      <Modal isOpen={!!voiding} onClose={() => setVoiding(null)} title="Huỷ phiếu ứng" size="sm">
        <p>Phiếu {voiding?.advance_no}. Phiếu đã huỷ không sửa lại được; cần ghi phiếu mới.</p>
        <label className={kit.fl}>
          Lý do huỷ
          <textarea className={kit.inp} rows={3} maxLength={REASON_MAX} value={reason} aria-invalid={!!reasonError} onChange={e => setReason(e.target.value)} />
        </label>
        {reasonError && <p role="alert" className={styles.error}>{reasonError}</p>}
        {voidError && <p role="alert" className={styles.error}>{voidError}</p>}
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => setVoiding(null)}>Hủy</Button>
          <Button variant="danger" isLoading={busy} onClick={confirmVoid}>Xác nhận huỷ</Button>
        </div>
      </Modal>
    </section>
  )
}
