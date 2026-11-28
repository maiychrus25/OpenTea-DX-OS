// SPDX-License-Identifier: MIT
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { BarChart3, Check, CheckCircle2, CheckSquare, Clock, Droplet, FileText, Image as ImageIcon, Leaf, Scissors, ShoppingBasket, SprayCan, Sprout, UserRound, X, XCircle } from 'lucide-react'
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

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  SOWING: <Sprout size={16} />,
  FERTILIZING: <Leaf size={16} />,
  SPRAYING: <SprayCan size={16} />,
  IRRIGATION: <Droplet size={16} />,
  HARVEST: <ShoppingBasket size={16} />,
  PRUNING: <Scissors size={16} />,
  OTHER: <BarChart3 size={16} />,
}

const STATUS = {
  PENDING_APPROVAL: { label: 'Chờ duyệt', tone: 'amber' },
  APPROVED: { label: 'Đã duyệt', tone: 'green' },
  REQUEST_CHANGES: { label: 'Yêu cầu sửa', tone: 'blue' },
  REJECTED: { label: 'Từ chối', tone: 'red' },
} as const

type View = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'

const VIEWS: Record<View, (e: JournalEntry) => boolean> = {
  PENDING: (e) => e.status === 'PENDING_APPROVAL',
  APPROVED: (e) => e.status === 'APPROVED',
  // Sent back for changes is also "not approved".
  REJECTED: (e) => e.status === 'REJECTED' || e.status === 'REQUEST_CHANGES',
  ALL: () => true,
}

const VIEW_LABELS: Record<View, string> = { PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối', ALL: 'Tất cả' }

const PERIODS = [{ days: 1, label: 'Hôm nay' }, { days: 7, label: '7 ngày qua' }, { days: 30, label: '30 ngày qua' }]

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

export function ApproveList() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [households, setHouseholds] = useState<Record<string, string>>({})
  const [view, setView] = useState<View>('PENDING')
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState(0)
  const [parcel, setParcel] = useState('')
  const [activity, setActivity] = useState('')
  const [page, setPage] = useState(1)
  const [opened, setOpened] = useState<JournalEntry | null>(null)
  const [rejecting, setRejecting] = useState<JournalEntry | null>(null)
  const [reason, setReason] = useState('')
  const [decision, setDecision] = useState<'REQUEST_CHANGES' | 'REJECTED'>('REQUEST_CHANGES')
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saving, setSaving] = useState(false)
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
  const contentOf = (e: JournalEntry) => {
    const product = e.activities?.[0]?.product_name
    return [formatDetail(e.activities?.[0]?.activity_detail, e.notes), product].filter(Boolean).join(' · ')
  }
  const material = (e: JournalEntry) => e.activities?.[0]?.product_name || '—'
  const withdrawal = (e: JournalEntry) => (e.activities?.[0]?.withdrawal_days ? `${e.activities[0].withdrawal_days} ngày` : 'Không')

  const needle = search.trim().toLocaleLowerCase('vi')
  const oldest = period ? Date.now() - period * 24 * 60 * 60 * 1000 : 0
  const parcels = Array.from(new Set(entries.map((e) => e.parcel_code).filter(Boolean))) as string[]
  const shown = entries.filter(
    (e) =>
      VIEWS[view](e) &&
      (!needle || [e.parcel_code, nameOf(e), contentOf(e), e.notes].some((text) => text?.toLocaleLowerCase('vi').includes(needle))) &&
      (!oldest || new Date(e.entry_date).getTime() >= oldest) &&
      (!parcel || e.parcel_code === parcel) &&
      (!activity || e.activity_type === activity)
  )
  const paged = pageOf(shown, page, 5)
  const count = (key: View) => entries.filter(VIEWS[key]).length

  async function send(url: string, payload: object, done: string) {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error?.message || 'Không gửi được. Hãy thử lại.')
      if (json?.data?.failed_ids?.length) throw new Error('Nhật ký này không duyệt được. Hãy tải lại trang.')
      setMessage({ type: 'success', text: done })
      fetchEntries()
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Lỗi không xác định' })
    } finally {
      setSaving(false)
    }
  }

  const approve = (e: JournalEntry) => send('/api/journal/batch-approve', { entry_ids: [e.id] }, 'Đã duyệt nhật ký.')

  async function handleReject(event: React.FormEvent) {
    event.preventDefault()
    if (!rejecting || !reason.trim()) return
    const target = rejecting
    setRejecting(null)
    await send(`/api/journal/${target.id}/review`, { decision, reason: reason.trim() }, decision === 'REJECTED' ? 'Đã từ chối nhật ký.' : 'Đã gửi yêu cầu sửa.')
    setReason('')
  }

  const statusOf = (e: JournalEntry) => STATUS[e.status as keyof typeof STATUS] ?? STATUS.PENDING_APPROVAL
  const filter = <T,>(set: (value: T) => void) => (value: T) => { set(value); setPage(1) }

  return (
    <div className={kit.page}>
      <PageHeader icon={<CheckSquare size={28} />} title="Duyệt nhật ký" description="Kiểm tra và phê duyệt nhật ký canh tác của xã viên." />

      {message && <p className={message.type === 'success' ? kit.success : kit.error} role="status">{message.text}</p>}

      {!loading && !loadFailed && (
        <>
          <StatCards items={[
            { label: 'Tổng nhật ký', value: count('ALL').toLocaleString('vi-VN'), icon: <FileText size={26} /> },
            { label: 'Chờ duyệt', value: count('PENDING').toLocaleString('vi-VN'), icon: <Clock size={26} />, tone: 'amber' },
            { label: 'Đã duyệt', value: count('APPROVED').toLocaleString('vi-VN'), icon: <CheckCircle2 size={26} /> },
            { label: 'Từ chối', value: count('REJECTED').toLocaleString('vi-VN'), icon: <XCircle size={26} />, tone: 'red' },
          ]} />

          <div className={ui.bar}>
            <Tabs<View> label="Trạng thái" value={view} onChange={filter(setView)} items={(Object.keys(VIEW_LABELS) as View[]).map((key) => ({ key, label: `${VIEW_LABELS[key]} (${count(key)})` }))} />
          </div>

          <div className={ui.bar}>
            <input type="search" className={`${ui.control} ${ui.grow}`} aria-label="Tìm nhật ký" placeholder="Tìm theo mã nương, xã viên, nội dung..." value={search} onChange={(e) => filter(setSearch)(e.target.value)} />
            <select className={ui.control} aria-label="Thời gian" value={period} onChange={(e) => filter(setPeriod)(Number(e.target.value))}>
              <option value={0}>Thời gian: Tất cả</option>
              {PERIODS.map((p) => <option key={p.days} value={p.days}>{p.label}</option>)}
            </select>
            <select className={ui.control} aria-label="Nương" value={parcel} onChange={(e) => filter(setParcel)(e.target.value)}>
              <option value="">Nương: Tất cả</option>
              {parcels.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
            <select className={ui.control} aria-label="Loại công việc" value={activity} onChange={(e) => filter(setActivity)(e.target.value)}>
              <option value="">Loại công việc: Tất cả</option>
              {Object.entries(ACTIVITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
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
                  <tr><th>#</th><th>Ngày ghi</th><th>Xã viên</th><th>Nương</th><th>Công việc</th><th>Nội dung thực hiện</th><th>Tệp đính kèm</th><th>Trạng thái</th><th>Thao tác</th></tr>
                </thead>
                <tbody>
                  {paged.rows.map((e, index) => (
                    <tr key={e.id}>
                      <td>{paged.start + index + 1}</td>
                      <td>{day(e.entry_date)}</td>
                      <td><span className={styles.who}><i aria-hidden="true"><UserRound size={16} /></i><strong>{nameOf(e)}</strong></span></td>
                      <td>{e.parcel_code ?? '—'}</td>
                      <td><span className={styles.who}><i aria-hidden="true">{ACTIVITY_ICONS[e.activity_type] ?? ACTIVITY_ICONS.OTHER}</i><strong>{ACTIVITY_LABELS[e.activity_type] || e.activity_type}</strong></span></td>
                      <td className={styles.content}><button type="button" onClick={() => setOpened(e)} title="Xem chi tiết">{contentOf(e)}</button></td>
                      <td>{e.photo_url ? <button type="button" className={ui.small} onClick={() => setOpened(e)}><ImageIcon size={14} aria-hidden="true" />1 ảnh</button> : '—'}</td>
                      <td><Pill tone={statusOf(e).tone}>{statusOf(e).label}</Pill></td>
                      <td>
                        <div className={ui.rowActions}>
                          {VIEWS.PENDING(e) ? (
                            <>
                              <button type="button" className={`${ui.small} ${ui.solid}`} disabled={saving} onClick={() => approve(e)}><Check size={14} aria-hidden="true" />Duyệt</button>
                              <button type="button" className={ui.small} disabled={saving} onClick={() => { setReason(''); setDecision('REQUEST_CHANGES'); setRejecting(e) }}><X size={14} aria-hidden="true" />Từ chối</button>
                            </>
                          ) : (
                            <button type="button" className={ui.small} onClick={() => setOpened(e)}>Xem</button>
                          )}
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
              <button type="submit" className={kit.primary} disabled={saving || !reason.trim()}>Gửi</button>
              <button type="button" className={kit.secondary} onClick={() => setRejecting(null)}>Huỷ</button>
            </div>
          </form>
        </dialog>
      )}
    </div>
  )
}
