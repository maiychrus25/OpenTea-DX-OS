// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import kit from '@/components/features/farmer-web/kit.module.css'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import { dayMonthYear } from '@/lib/weighing/format'
import type { SettlementPeriod } from '@/lib/ledger/types'
import styles from './ledger.module.css'

interface Props {
  /** Where the period links go, e.g. "/accountant" or "/manager". */
  basePath: string
}

/** Settlement periods of the HTX, with the dialog that starts a new one. */
export function SettlementList({ basePath }: Props) {
  const [periods, setPeriods] = useState<SettlementPeriod[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [creating, setCreating] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [createError, setCreateError] = useState('')
  const [created, setCreated] = useState<SettlementPeriod | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => fetchJson<{ data: SettlementPeriod[] }>('/api/settlements')
    .then(body => { setPeriods(body.data); setLoadError('') })
    .catch(() => setLoadError(LOAD_FAILED_MESSAGE))

  useEffect(() => { void load() }, [])

  function openCreate() {
    setDateFrom('')
    setDateTo('')
    setCreateError('')
    setCreating(true)
  }

  async function create() {
    if (!dateFrom || !dateTo) { setCreateError('Chọn đủ ngày bắt đầu và ngày kết thúc.'); return }
    if (dateFrom > dateTo) { setCreateError('Ngày bắt đầu phải trước hoặc cùng ngày kết thúc.'); return }
    setBusy(true)
    setCreateError('')
    try {
      const res = await fetch('/api/settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_from: dateFrom, date_to: dateTo }),
      })
      const json = await res.json().catch(() => ({}))
      // 422 carries the rule that failed (gap, overlap, future end, a second draft, unsettled slips); show it as sent.
      if (!res.ok) { setCreateError(json?.error?.message || 'Không tạo được kỳ quyết toán.'); return }
      setCreated(json.data)
      setCreating(false)
      void load()
    } catch {
      setCreateError('Lỗi kết nối máy chủ.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={kit.pn} aria-labelledby="settlement-list-title">
      <div className={kit.ph}>
        <h2 id="settlement-list-title">Các kỳ quyết toán</h2>
        <Button size="sm" onClick={openCreate}>Tạo kỳ</Button>
      </div>
      {created && <p role="status" className={`${styles.status} ${styles.pad}`}>Đã tạo kỳ {created.code}.</p>}
      {loadError && <p role="alert" className={`${styles.error} ${styles.pad}`}>{loadError}</p>}
      {periods?.length === 0 && <p className={`${kit.muted} ${styles.pad}`}>Chưa có kỳ quyết toán nào. Bấm “Tạo kỳ”.</p>}
      <ul className={kit.list}>
        {(periods ?? []).map(p => (
          <li key={p.id} className={styles.row}>
            <div className={styles.grow}>
              <Link href={`${basePath}/settlements/${p.id}`} className={styles.link}><strong>{p.code}</strong></Link>
              <span className={kit.muted}>{dayMonthYear(p.date_from)} – {dayMonthYear(p.date_to)} · {p.created_by_name ?? 'Chưa rõ'}</span>
            </div>
            <span className={kit.tag}>{p.status === 'CLOSED' ? 'Đã chốt' : 'Nháp'}</span>
          </li>
        ))}
      </ul>

      <Modal isOpen={creating} onClose={() => setCreating(false)} title="Tạo kỳ quyết toán" size="sm">
        <div className={styles.formGrid}>
          <label className={kit.fl}>
            Từ ngày
            <input className={kit.inp} type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </label>
          <label className={kit.fl}>
            Đến ngày
            <input className={kit.inp} type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </label>
        </div>
        {createError && <p role="alert" className={styles.error}>{createError}</p>}
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => setCreating(false)}>Hủy</Button>
          <Button isLoading={busy} onClick={create}>Tạo kỳ</Button>
        </div>
      </Modal>
    </section>
  )
}
