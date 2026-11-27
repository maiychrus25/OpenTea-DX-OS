// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, ArrowUpRight } from 'lucide-react'
import { Pill } from '@/components/ui'
import styles from './overview.module.css'

export interface OverviewEntry {
  id: string
  parcelCode: string
  household: string
  activity: string
  date: string
  status: string
}
const STATUS: Record<string, { label: string; tone: 'wait' | 'ok' | 'bad' | 'info' | 'muted' }> = {
  PENDING_APPROVAL: { label: 'Chờ duyệt', tone: 'wait' },
  APPROVED: { label: 'Đã duyệt', tone: 'ok' },
  REJECTED: { label: 'Từ chối', tone: 'bad' },
  REQUEST_CHANGES: { label: 'Yêu cầu sửa', tone: 'info' },
}

export function OverviewJournal({ entries, page, total, pageCount }: { entries: OverviewEntry[]; page: number; total: number; pageCount: number }) {
  const router = useRouter()
  const inFlight = useRef(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [approved, setApproved] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  async function approve(id: string) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(id)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/journal/batch-approve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_ids: [id] }),
      })
      const result = await response.json()
      if (!response.ok || result.data?.approved_count !== 1 || result.data?.failed_ids?.length) {
        throw new Error(result.error?.message || 'Chưa duyệt được nhật ký. Vui lòng thử lại.')
      }
      setApproved(previous => [...previous, id])
      setNotice('Đã duyệt nhật ký.')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể kết nối. Vui lòng thử lại.')
    } finally {
      inFlight.current = false
      setBusy(null)
    }
  }

  return <>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <span role="status" className={styles.srOnly}>{notice}</span>
    <div className={styles.tableWrap} tabIndex={0} aria-label="Nhật ký gần đây">
      <table className={styles.table} data-testid="task-table">
        <thead><tr><th>Mã thửa</th><th>Nông hộ</th><th>Hoạt động</th><th>Ngày</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
        <tbody>{entries.length ? entries.map(entry => {
          const status = approved.includes(entry.id) ? 'APPROVED' : entry.status
          const display = STATUS[status] ?? { label: status, tone: 'muted' as const }
          return <tr key={entry.id}>
            <td className={styles.code}>{entry.parcelCode}</td><td>{entry.household}</td><td>{entry.activity}</td><td>{entry.date}</td>
            <td><Pill tone={display.tone}>{display.label}</Pill></td>
            <td><div className={styles.rowActions}>
              {status === 'PENDING_APPROVAL' && <button type="button" className={styles.iconButton} disabled={busy !== null} onClick={() => void approve(entry.id)} aria-label={`Duyệt nhật ký ${entry.parcelCode} ${entry.date}`} title="Duyệt nhật ký"><Check size={15} aria-hidden="true" />{busy === entry.id && <span>…</span>}</button>}
              <Link href={`/officer/journal?entryId=${encodeURIComponent(entry.id)}`} className={styles.iconButton} aria-label={`Mở nhật ký ${entry.parcelCode} ${entry.date}`} title="Mở nhật ký"><ArrowUpRight size={15} aria-hidden="true" /></Link>
            </div></td>
          </tr>
        }) : <tr><td colSpan={6} className={styles.empty}>Chưa có nhật ký nào</td></tr>}</tbody>
      </table>
    </div>
    <nav className={styles.pagination} aria-label="Trang nhật ký">
      <span>{total ? `${(page - 1) * 6 + 1}–${Math.min(page * 6, total)}` : '0'} / {total} nhật ký</span>
      <div>{page > 1 && <Link className={styles.iconButton} href={`/officer/dashboard?page=${page - 1}`} scroll={false} aria-label="Trang trước">‹</Link>}
        <span aria-current="page">{page} / {pageCount}</span>
        {page < pageCount && <Link className={styles.iconButton} href={`/officer/dashboard?page=${page + 1}`} scroll={false} aria-label="Trang sau">›</Link>}</div>
    </nav>
  </>
}
