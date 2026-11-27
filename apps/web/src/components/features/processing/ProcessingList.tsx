// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import Link from 'next/link'
import React, { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import kit from '@/components/features/farmer-web/kit.module.css'
import { localDay } from '@/domain/shared/local-day'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import { processingErrorText } from '@/lib/processing/errors'
import type { BatchStatus, BatchView } from '@/lib/processing/types'
import { dayMonthYear } from '@/lib/weighing/format'
import styles from './processing.module.css'

const STATUS_LABELS: Record<BatchStatus, string> = { OPEN: 'Đang mở', FINISHED: 'Đã hoàn thành', CANCELLED: 'Đã huỷ' }
const kg = (value: number) => value.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

interface Props {
  /** "/officer" or "/manager": the batch links point into the caller's own area. */
  basePath: string
}

/** The processing batches of the HTX, newest first, with the form that opens a new one. */
export function ProcessingList({ basePath }: Props) {
  const [status, setStatus] = useState('')
  const [batches, setBatches] = useState<BatchView[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [processedOn, setProcessedOn] = useState(localDay(new Date()))
  const [masterName, setMasterName] = useState('')
  const [shift, setShift] = useState('')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState('')
  const [opened, setOpened] = useState<BatchView | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    const query = status ? `?status=${status}` : ''
    return fetchJson<{ data: BatchView[] }>(`/api/processing-batches${query}`)
      .then(body => { setBatches(body.data); setLoadError('') })
      .catch(() => setLoadError(LOAD_FAILED_MESSAGE))
  }, [status])

  useEffect(() => { void load() }, [load])

  async function open() {
    if (!processedOn) { setFormError('Chọn ngày chế biến.'); return }
    setBusy(true)
    setFormError('')
    try {
      const res = await fetch('/api/processing-batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          processed_on: processedOn,
          ...(masterName.trim() ? { master_name: masterName.trim() } : {}),
          ...(shift.trim() ? { shift: shift.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setFormError(processingErrorText(json?.error?.code, json?.error?.message, 'Không mở được mẻ mới.')); return }
      setOpened(json.data)
      setMasterName(''); setShift(''); setNotes('')
      void load()
    } catch {
      setFormError('Lỗi kết nối máy chủ.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.listLayout}>
      <section className={kit.pn} aria-labelledby="batch-list-title">
        <div className={kit.ph}>
          <h2 id="batch-list-title">Các mẻ sao sấy</h2>
          <label className={styles.inlineField}>
            Trạng thái
            <select className={kit.inp} value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">Tất cả</option>
              <option value="OPEN">Đang mở</option>
              <option value="FINISHED">Đã hoàn thành</option>
              <option value="CANCELLED">Đã huỷ</option>
            </select>
          </label>
        </div>
        {loadError && <p role="alert" className={`${styles.error} ${styles.pad}`}>{loadError}</p>}
        {!loadError && batches === null && <p className={`${kit.muted} ${styles.pad}`}>Đang tải danh sách mẻ...</p>}
        {batches?.length === 0 && <p className={`${kit.muted} ${styles.pad}`}>Chưa có mẻ nào. Mở mẻ mới ở bên cạnh.</p>}
        {batches && batches.length > 0 && (
          <ul className={kit.list}>
            {batches.map(b => (
              <li key={b.id} className={styles.batchRow}>
                <div className={styles.grow}>
                  <Link href={`${basePath}/processing/${b.id}`} className={styles.link}><strong>{b.batch_code}</strong></Link>
                  <span className={kit.muted}>{dayMonthYear(b.processed_on)}{b.master_name ? ` · ${b.master_name}` : ''} · {b.ticket_count} phiếu</span>
                  <span>{kg(b.fresh_kg)} kg tươi → {kg(b.dry_kg)} kg khô{b.recovery_ratio !== null ? ` · tỷ lệ ${b.recovery_ratio.toFixed(2).replace('.', ',')} : 1` : ''}</span>
                </div>
                <div className={styles.badges}>
                  <span className={kit.tag}>{STATUS_LABELS[b.status]}</span>
                  {b.out_of_band && <span className={styles.outBand}>Lệch khoảng chuẩn</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={kit.pn} aria-labelledby="open-batch-title">
        <div className={kit.ph}><h2 id="open-batch-title">Mở mẻ mới</h2></div>
        <div className={styles.form}>
          <label className={kit.fl}>
            Ngày chế biến
            <input className={kit.inp} type="date" value={processedOn} max={localDay(new Date())} onChange={e => setProcessedOn(e.target.value)} />
          </label>
          <label className={kit.fl}>
            Nghệ nhân sao
            <input className={kit.inp} maxLength={80} value={masterName} onChange={e => setMasterName(e.target.value)} />
          </label>
          <label className={kit.fl}>
            Ca
            <input className={kit.inp} maxLength={40} value={shift} onChange={e => setShift(e.target.value)} />
          </label>
          <label className={kit.fl}>
            Ghi chú
            <textarea className={kit.inp} rows={2} maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} />
          </label>
          {formError && <p role="alert" className={styles.error}>{formError}</p>}
          {opened && (
            <p role="status" className={styles.status}>
              Đã mở mẻ {opened.batch_code}. <Link href={`${basePath}/processing/${opened.id}`} className={styles.link}>Mở mẻ này</Link>
            </p>
          )}
          <Button isLoading={busy} onClick={open}>Mở mẻ mới</Button>
        </div>
      </section>
    </div>
  )
}
