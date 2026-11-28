// SPDX-License-Identifier: MIT
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, CheckCircle2, CheckSquare, Clock, Download, Pencil } from 'lucide-react'
import { EmptyState, PageHeader, Pill } from '@/components/ui'
import table from '@/components/features/dashboard/dashboard.module.css'
import kit from '@/components/features/dashboard/page-kit.module.css'
import { Stats } from '@/components/features/officer-web/parts'
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

type View = 'PENDING' | 'OVERDUE' | 'APPROVED' | 'CHANGES'

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

function approvedThisMonth(e: JournalEntry) {
  if (e.status !== 'APPROVED' || !e.approved_at) return false
  const when = new Date(e.approved_at)
  const now = new Date()
  return when.getFullYear() === now.getFullYear() && when.getMonth() === now.getMonth()
}

const VIEWS: Record<View, (e: JournalEntry) => boolean> = {
  PENDING: (e) => e.status === 'PENDING_APPROVAL',
  OVERDUE: isOverdue,
  APPROVED: approvedThisMonth,
  CHANGES: (e) => e.status === 'REQUEST_CHANGES',
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
  const [opened, setOpened] = useState<JournalEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [approving, setApproving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)

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

  const nameOf = (e: JournalEntry) => (e.household_id && households[e.household_id]) || e.performed_by
  const shown = entries.filter(
    (e) =>
      VIEWS[view](e) &&
      (!activity || e.activity_type === activity) &&
      (!household || e.household_id === household) &&
      (!from || e.entry_date.slice(0, 10) >= from) &&
      (!to || e.entry_date.slice(0, 10) <= to)
  )
  const selectable = shown.filter(VIEWS.PENDING)
  const chosen = selectable.filter((e) => selected.has(e.id))

  const toggle = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  async function handleApprove() {
    if (chosen.length === 0) return
    setApproving(true)
    setMessage(null)
    let approved = 0
    let failed = 0
    try {
      const ids = chosen.map((e) => e.id)
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

  const statusOf = (e: JournalEntry) => (isOverdue(e) ? STATUS.OVERDUE : STATUS[e.status as keyof typeof STATUS] ?? STATUS.PENDING_APPROVAL)
  const material = (e: JournalEntry) => e.activities?.[0]?.product_name || '—'
  const withdrawal = (e: JournalEntry) => (e.activities?.[0]?.withdrawal_days ? `${e.activities[0].withdrawal_days} ngày` : 'Không')

  const figure = (key: View, label: string, icon: React.ReactNode) => ({
    label,
    value: entries.filter(VIEWS[key]).length,
    icon,
    active: view === key,
    onSelect: () => { setView(key); setSelected(new Set()) },
  })

  return (
    <div className={kit.page}>
      <PageHeader
        icon={<CheckSquare size={28} />}
        title="Duyệt nhật ký"
        description="Nhật ký canh tác đang chờ Trưởng HTX phê duyệt"
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
            <button type="button" className={kit.primary} disabled={chosen.length === 0 || approving} onClick={handleApprove}>
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
        <Stats items={[
          figure('PENDING', 'Chờ duyệt', <Clock />),
          figure('OVERDUE', 'Quá hạn', <AlertTriangle />),
          figure('APPROVED', 'Đã duyệt tháng này', <CheckCircle2 />),
          figure('CHANGES', 'Yêu cầu sửa', <Pencil />),
        ]} />
      )}

      <div className={kit.card}>
        {!loading && !loadFailed && entries.length > 0 && (
          <div className={styles.filters}>
            <label>Hoạt động
              <select value={activity} onChange={(e) => setActivity(e.target.value)}>
                <option value="">Tất cả</option>
                {Object.entries(ACTIVITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>Nông hộ
              <select value={household} onChange={(e) => setHousehold(e.target.value)}>
                <option value="">Tất cả nông hộ</option>
                {Object.entries(households).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
            <label>Từ ngày<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label>Đến ngày<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
        )}

        {loading ? (
          <div className={kit.state}>Đang tải...</div>
        ) : loadFailed ? (
          <div className={kit.state}>{LOAD_FAILED_MESSAGE}</div>
        ) : shown.length === 0 ? (
          <EmptyState icon={<CheckCircle2 size={28} />} title={view === 'PENDING' ? 'Không có nhật ký nào đang chờ duyệt!' : 'Không có nhật ký nào trong mục này.'} />
        ) : (
          <>
            <div className={table.tableWrap}>
              <table className={table.table}>
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
                    <th>STT</th>
                    <th>Thửa</th>
                    <th>Nông hộ</th>
                    <th>Hoạt động</th>
                    <th>Vật tư</th>
                    <th>Cách ly</th>
                    <th>Ngày</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((e, index) => (
                    <tr key={e.id}>
                      <td className={kit.checkCell}>
                        <input type="checkbox" aria-label={`Chọn nhật ký ${index + 1}`} disabled={!VIEWS.PENDING(e)} checked={selected.has(e.id)} onChange={() => toggle(e.id)} />
                      </td>
                      <td>{index + 1}</td>
                      <td>{e.parcel_code ?? '—'}</td>
                      <td>{nameOf(e)}</td>
                      <td>{ACTIVITY_LABELS[e.activity_type] || e.activity_type}</td>
                      <td>{material(e)}</td>
                      <td>{withdrawal(e)}</td>
                      <td>{day(e.entry_date)}</td>
                      <td><Pill tone={statusOf(e).tone}>{statusOf(e).label}</Pill></td>
                      <td><button type="button" className={kit.linkButton} onClick={() => setOpened(e)}>Xem</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={kit.footer}>Đã chọn {chosen.length} · Hiển thị {shown.length} nhật ký</div>
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
    </div>
  )
}
