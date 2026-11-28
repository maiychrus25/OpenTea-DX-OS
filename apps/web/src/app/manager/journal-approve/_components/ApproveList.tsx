// SPDX-License-Identifier: MIT
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Check, CheckCircle2, CheckSquare, Clock, Download, FileText, Image as ImageIcon, X, XCircle } from 'lucide-react'
import { EmptyState, PageHeader, Pill } from '@/components/ui'
import table from '@/components/features/dashboard/dashboard.module.css'
import kit from '@/components/features/dashboard/page-kit.module.css'
import { Pager, StatCards, Tabs, pageOf } from '@/components/features/manager-web/parts'
import ui from '@/components/features/manager-web/kit.module.css'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import styles from './approve.module.css'

interface JournalEntry {
  id: string
  household_id?: string
  parcel_code?: string
  status: string
  entry_date: string
  created_at?: string
  approved_at?: string | null
  activity_type: string
  performed_by: string
  notes: string | null
  photo_url?: string | null
  activities: { activity_detail: string; product_name: string | null; dosage?: string | null; withdrawal_days?: number | null }[]
}

const ACTIVITY_LABELS: Record<string, string> = {
  SOWING: 'Trồng mới',
  FERTILIZING: 'Bón phân',
  SPRAYING: 'Phun thuốc',
  IRRIGATION: 'Tưới tiêu',
  HARVEST: 'Thu hoạch',
  PRUNING: 'Đốn chè',
  OTHER: 'Khác',
}

const STATUS = {
  PENDING_APPROVAL: { label: 'Chờ duyệt', tone: 'amber' },
  APPROVED: { label: 'Đã duyệt', tone: 'green' },
  REQUEST_CHANGES: { label: 'Yêu cầu sửa', tone: 'blue' },
  REJECTED: { label: 'Từ chối', tone: 'neutral' },
  OVERDUE: { label: 'Quá hạn', tone: 'red' },
} as const

/** A journal still waiting this long after it was sent is overdue. */
const OVERDUE_MS = 2 * 24 * 60 * 60 * 1000

type View = 'PENDING' | 'OVERDUE' | 'APPROVED' | 'CHANGES' | 'REJECTED' | 'ALL'

const day = (value: string) => new Date(value).toLocaleDateString('vi-VN')

function formatDetail(detail: string | null | undefined, notes: string | null): string {
  const text = detail || notes
  if (!text) return '—'
  if (ACTIVITY_LABELS[text]) return ACTIVITY_LABELS[text]
  for (const [key, label] of Object.entries(ACTIVITY_LABELS)) {
    if (text.startsWith(`${key}: `)) return text.replace(`${key}: `, `${label}: `)
  }
  return text
}

const isOverdue = (e: JournalEntry) => e.status === 'PENDING_APPROVAL' && Date.now() - new Date(e.created_at ?? e.entry_date).getTime() > OVERDUE_MS

const VIEWS: Record<View, (e: JournalEntry) => boolean> = {
  PENDING: (e) => e.status === 'PENDING_APPROVAL',
  OVERDUE: isOverdue,
  APPROVED: (e) => e.status === 'APPROVED',
  CHANGES: (e) => e.status === 'REQUEST_CHANGES',
  REJECTED: (e) => e.status === 'REJECTED',
  ALL: () => true,
}

const VIEW_LABELS: Record<View, string> = {
  PENDING: 'Chờ duyệt',
  OVERDUE: 'Quá hạn',
  APPROVED: 'Đã duyệt',
  CHANGES: 'Yêu cầu sửa',
  REJECTED: 'Từ chối',
  ALL: 'Tất cả',
}

function downloadCsv(rows: string[][]) {
  // A leading quote keeps a cell that starts like a formula from being run by a spreadsheet.
  const cell = (value: string) => `"${(/^[=+\-@]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`
  const blob = new Blob([`﻿${rows.map((row) => row.map(cell).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'nhat-ky.csv'
  link.click()
  URL.revokeObjectURL(url)
}

/** The most entries one batch-approve request takes. */
const BATCH_LIMIT = 50

export function ApproveList() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [households, setHouseholds] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [view, setView] = useState<View>('PENDING')
  const [activity, setActivity] = useState('')
  const [household, setHousehold] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [opened, setOpened] = useState<JournalEntry | null>(null)
  const [rejecting, setRejecting] = useState<JournalEntry | null>(null)
  const [reason, setReason] = useState('')
  const [decision, setDecision] = useState<'REQUEST_CHANGES' | 'REJECTED'>('REQUEST_CHANGES')
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [approving, setApproving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const rejectDialog = useRef<HTMLDialogElement>(null)

  const fetchEntries = useCallback(() => {
    setLoading(true)
    fetchJson<{ data?: JournalEntry[] }>('/api/journal?limit=1000')
      .then((j) => { setEntries(j.data || []); setLoadFailed(false) })
      .catch(() => { setEntries([]); setLoadFailed(true) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  useEffect(() => {
    // Only the household names; without them the column stays empty and approving still works.
    fetchJson<{ data?: { id: string; name: string }[] }>('/api/farm/households')
      .then((j) => setHouseholds(Object.fromEntries((j.data || []).map((h) => [h.id, h.name]))))
      .catch(() => setHouseholds({}))
  }, [])

  useEffect(() => {
    if (opened) dialog.current?.showModal?.()
  }, [opened])

  useEffect(() => {
    if (rejecting) rejectDialog.current?.showModal?.()
  }, [rejecting])

  const nameOf = (e: JournalEntry) => (e.household_id && households[e.household_id]) || e.performed_by
  const contentOf = (e: JournalEntry) => formatDetail(e.activities?.[0]?.activity_detail, e.notes)
  const needle = search.trim().toLocaleLowerCase('vi')
  const shown = entries.filter(
    (e) =>
      VIEWS[view](e) &&
      (!needle || [e.parcel_code, nameOf(e), contentOf(e), e.activities?.[0]?.product_name, e.notes].some((text) => text?.toLocaleLowerCase('vi').includes(needle))) &&
      (!activity || e.activity_type === activity) &&
      (!household || e.household_id === household) &&
      (!from || e.entry_date.slice(0, 10) >= from) &&
      (!to || e.entry_date.slice(0, 10) <= to)
  )
  const selectable = shown.filter(VIEWS.PENDING)
  const chosen = selectable.filter((e) => selected.has(e.id))
  const paged = pageOf(shown, page)

  const toggle = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  async function handleApprove(targets: JournalEntry[]) {
    if (targets.length === 0) return
    setApproving(true)
    setMessage(null)
    let approved = 0
    let failed = 0
    try {
      const ids = targets.map((e) => e.id)
      for (let at = 0; at < ids.length; at += BATCH_LIMIT) {
        const res = await fetch('/api/journal/batch-approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entry_ids: ids.slice(at, at + BATCH_LIMIT) }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err?.error?.message || 'Lỗi duyệt nhật ký')
        }
        const { approved_count, failed_ids } = (await res.json()).data
        approved += approved_count
        failed += failed_ids.length
      }
      setMessage({ type: 'success', text: `Đã duyệt ${approved} nhật ký thành công.${failed > 0 ? ` ${failed} thất bại.` : ''}` })
      setSelected(new Set())
      fetchEntries()
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Lỗi không xác định'
      setMessage({ type: 'error', text: approved > 0 ? `Đã duyệt ${approved} nhật ký, phần còn lại chưa duyệt: ${reason}` : reason })
      // Earlier batches stay approved.
      if (approved > 0) { setSelected(new Set()); fetchEntries() }
    } finally {
      setApproving(false)
    }
  }

  async function handleReject(event: React.FormEvent) {
    event.preventDefault()
    if (!rejecting || !reason.trim()) return
    setApproving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/journal/${rejecting.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason: reason.trim() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error?.message || 'Không gửi được. Hãy thử lại.')
      }
      setMessage({ type: 'success', text: decision === 'REJECTED' ? 'Đã từ chối nhật ký.' : 'Đã gửi yêu cầu sửa.' })
      setRejecting(null)
      setReason('')
      fetchEntries()
    } catch (err: unknown) {
      setRejecting(null)
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Lỗi không xác định' })
    } finally {
      setApproving(false)
    }
  }

  const statusOf = (e: JournalEntry) => (isOverdue(e) ? STATUS.OVERDUE : STATUS[e.status as keyof typeof STATUS] ?? STATUS.PENDING_APPROVAL)
  const material = (e: JournalEntry) => e.activities?.[0]?.product_name || '—'
  const withdrawal = (e: JournalEntry) => (e.activities?.[0]?.withdrawal_days ? `${e.activities[0].withdrawal_days} ngày` : 'Không')

  const count = (key: View) => entries.filter(VIEWS[key]).length
  /** A new filter starts again from the first page with nothing ticked. */
  const reset = () => { setPage(1); setSelected(new Set()) }

  return (
    <div className={kit.page}>
      <PageHeader
        icon={<CheckSquare size={28} />}
        title="Duyệt nhật ký"
        description="Kiểm tra và phê duyệt nhật ký canh tác của xã viên."
        actions={
          <>
            <button
              type="button"
              className={kit.secondary}
              disabled={shown.length === 0}
              onClick={() => downloadCsv([
                ['Thửa', 'Nông hộ', 'Hoạt động', 'Vật tư', 'Cách ly', 'Ngày', 'Trạng thái'],
                ...shown.map((e) => [e.parcel_code ?? '', nameOf(e), ACTIVITY_LABELS[e.activity_type] ?? e.activity_type, material(e), withdrawal(e), day(e.entry_date), statusOf(e).label]),
              ])}
            >
              <Download size={16} aria-hidden="true" /> Xuất CSV
            </button>
            <button type="button" className={kit.primary} disabled={chosen.length === 0 || approving} onClick={() => handleApprove(chosen)}>
              {approving ? 'Đang duyệt...' : (
                <>
                  <Check size={16} aria-hidden="true" />
                  Duyệt ({chosen.length})
                </>
              )}
            </button>
          </>
        }
      />

      {message && <p className={message.type === 'success' ? kit.success : kit.error} role="status">{message.text}</p>}

      {!loading && !loadFailed && (
        <>
          <StatCards items={[
            { label: 'Tổng nhật ký', value: count('ALL').toLocaleString('vi-VN'), icon: <FileText size={26} /> },
            { label: 'Chờ duyệt', value: count('PENDING').toLocaleString('vi-VN'), icon: <Clock size={26} />, tone: 'amber', note: count('OVERDUE') ? `${count('OVERDUE')} quá hạn` : undefined },
            { label: 'Đã duyệt', value: count('APPROVED').toLocaleString('vi-VN'), icon: <CheckCircle2 size={26} /> },
            { label: 'Từ chối', value: count('REJECTED').toLocaleString('vi-VN'), icon: <XCircle size={26} />, tone: 'red', note: count('CHANGES') ? `${count('CHANGES')} yêu cầu sửa` : undefined },
          ]} />

          <div className={ui.bar}>
            <Tabs
              label="Trạng thái"
              value={view}
              onChange={(key) => { setView(key); reset() }}
              items={(Object.keys(VIEW_LABELS) as View[]).map((key) => ({ key, label: `${VIEW_LABELS[key]} (${count(key)})` }))}
            />
          </div>

          <div className={ui.bar}>
            <input type="search" className={`${ui.control} ${ui.grow}`} aria-label="Tìm nhật ký" placeholder="Tìm theo mã thửa, xã viên, nội dung..." value={search} onChange={(e) => { setSearch(e.target.value); reset() }} />
            <select className={ui.control} aria-label="Hoạt động" value={activity} onChange={(e) => { setActivity(e.target.value); reset() }}>
              <option value="">Công việc: Tất cả</option>
              {Object.entries(ACTIVITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select className={ui.control} aria-label="Nông hộ" value={household} onChange={(e) => { setHousehold(e.target.value); reset() }}>
              <option value="">Nông hộ: Tất cả</option>
              {Object.entries(households).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <input type="date" className={ui.control} aria-label="Từ ngày" value={from} onChange={(e) => { setFrom(e.target.value); reset() }} />
            <input type="date" className={ui.control} aria-label="Đến ngày" value={to} onChange={(e) => { setTo(e.target.value); reset() }} />
          </div>
        </>
      )}

      <div className={kit.card}>
        {loading ? (
          <div className={kit.state}>Đang tải...</div>
        ) : loadFailed ? (
          <div className={kit.state}>{LOAD_FAILED_MESSAGE}</div>
        ) : shown.length === 0 ? (
          <EmptyState icon={<CheckCircle2 size={28} />} title={view === 'PENDING' && !needle ? 'Không có nhật ký nào đang chờ duyệt!' : 'Không có nhật ký nào trong mục này.'} />
        ) : (
          <>
            <div className={table.tableWrap}>
              <table className={`${table.table} ${styles.list}`}>
                <thead>
                  <tr>
                    <th className={kit.checkCell}>
                      <input
                        type="checkbox"
                        aria-label={`Chọn tất cả (${selectable.length})`}
                        disabled={selectable.length === 0}
                        checked={selectable.length > 0 && chosen.length === selectable.length}
                        onChange={() => setSelected(chosen.length === selectable.length ? new Set() : new Set(selectable.map((e) => e.id)))}
                      />
                    </th>
                    <th>Ngày ghi</th>
                    <th>Xã viên</th>
                    <th>Thửa</th>
                    <th>Công việc</th>
                    <th>Nội dung thực hiện</th>
                    <th>Đính kèm</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.rows.map((e, index) => (
                    <tr key={e.id}>
                      <td className={kit.checkCell}>
                        <input type="checkbox" aria-label={`Chọn nhật ký ${paged.start + index + 1}`} disabled={!VIEWS.PENDING(e)} checked={selected.has(e.id)} onChange={() => toggle(e.id)} />
                      </td>
                      <td>{day(e.entry_date)}</td>
                      <td><strong>{nameOf(e)}</strong></td>
                      <td>{e.parcel_code ?? '—'}</td>
                      <td>{ACTIVITY_LABELS[e.activity_type] || e.activity_type}</td>
                      <td className={styles.content}>
                        {contentOf(e)}
                        {e.activities?.[0]?.product_name && <small>{material(e)} · cách ly: {withdrawal(e)}</small>}
                      </td>
                      <td>{e.photo_url ? <button type="button" className={ui.small} onClick={() => setOpened(e)}><ImageIcon size={14} aria-hidden="true" />1 ảnh</button> : '—'}</td>
                      <td><Pill tone={statusOf(e).tone}>{statusOf(e).label}</Pill></td>
                      <td>
                        <div className={ui.rowActions}>
                          {VIEWS.PENDING(e) && (
                            <>
                              <button type="button" className={`${ui.small} ${ui.solid}`} disabled={approving} onClick={() => handleApprove([e])}><Check size={14} aria-hidden="true" />Duyệt</button>
                              <button type="button" className={ui.small} disabled={approving} onClick={() => { setReason(''); setDecision('REQUEST_CHANGES'); setRejecting(e) }}><X size={14} aria-hidden="true" />Từ chối</button>
                            </>
                          )}
                          <button type="button" className={kit.linkButton} onClick={() => setOpened(e)}>Xem</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager current={paged.current} pages={paged.pages} start={paged.start} shown={paged.rows.length} total={shown.length} unit="nhật ký" onPage={setPage} />
          </>
        )}
      </div>

      {opened && (
        <dialog ref={dialog} className={styles.dialog} aria-labelledby="journal-detail" onClose={() => setOpened(null)}>
          <h2 id="journal-detail">Chi tiết nhật ký</h2>
          <dl>
            <div><dt>Thửa</dt><dd>{opened.parcel_code ?? '—'}</dd></div>
            <div><dt>Nông hộ</dt><dd>{nameOf(opened)}</dd></div>
            <div><dt>Người thực hiện</dt><dd>{opened.performed_by}</dd></div>
            <div><dt>Ngày</dt><dd>{day(opened.entry_date)}</dd></div>
            <div><dt>Chi tiết</dt><dd>{formatDetail(opened.activities?.[0]?.activity_detail, opened.notes)}</dd></div>
            <div><dt>Vật tư</dt><dd>{material(opened)}{opened.activities?.[0]?.dosage ? ` · ${opened.activities[0].dosage}` : ''}</dd></div>
            <div><dt>Cách ly</dt><dd>{withdrawal(opened)}</dd></div>
            <div><dt>Ghi chú</dt><dd>{opened.notes || '—'}</dd></div>
          </dl>
          {/* eslint-disable-next-line @next/next/no-img-element -- a presigned storage URL */}
          {opened.photo_url && <img src={opened.photo_url} alt="Ảnh hiện trường" />}
          <button type="button" className={kit.secondary} onClick={() => setOpened(null)}>Đóng</button>
        </dialog>
      )}

      {rejecting && (
        <dialog ref={rejectDialog} className={styles.dialog} aria-labelledby="journal-reject" onClose={() => setRejecting(null)}>
          <h2 id="journal-reject">Không duyệt nhật ký thửa {rejecting.parcel_code ?? '—'}</h2>
          <form onSubmit={handleReject} className={styles.rejectForm}>
            <label>Cách xử lý
              <select value={decision} onChange={(e) => setDecision(e.target.value as 'REQUEST_CHANGES' | 'REJECTED')}>
                <option value="REQUEST_CHANGES">Yêu cầu nông hộ sửa lại</option>
                <option value="REJECTED">Từ chối hẳn</option>
              </select>
            </label>
            <label>Lý do
              <textarea required maxLength={500} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <div className={ui.rowActions}>
              <button type="submit" className={kit.primary} disabled={approving || !reason.trim()}>Gửi</button>
              <button type="button" className={kit.secondary} onClick={() => setRejecting(null)}>Huỷ</button>
            </div>
          </form>
        </dialog>
      )}
    </div>
  )
}
