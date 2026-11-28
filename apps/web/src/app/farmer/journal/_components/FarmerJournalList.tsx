// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Calendar, ChevronDown, ChevronRight, Droplet, FileText, Layers, Leaf, Pencil, Plus, Scissors, SprayCan, Sprout, Trash2 } from 'lucide-react'
import kit from '@/components/features/farmer-web/kit.module.css'
import styles from '../journal.module.css'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import { QUEUED_MESSAGE, useJournalOfflineQueue, type JournalPayload } from '@/lib/hooks/useJournalOfflineQueue'

interface JournalEntry {
  id: string
  entry_date: string
  parcel_code?: string
  activity_type: string
  performed_by: string
  status: string
  notes: string | null
  activities: { activity_detail: string; product_name: string | null; dosage?: string; performer?: string; withdrawal_days?: number; pesticide_product_id?: string | null }[]
  history?: { date: string, action: string, note?: string }[]
  created_at?: string | null
  approved_at?: string | null
  review_note?: string | null
  photo_url?: string
}

const STATUS_MAP: Record<string, { label: string; tone: string }> = {
  PENDING_APPROVAL: { label: 'Chờ duyệt', tone: 'amber' },
  APPROVED: { label: 'Đã duyệt', tone: 'soft' },
  DRAFT: { label: 'Bản nháp', tone: 'mu' },
  REJECTED: { label: 'Từ chối', tone: 'bd' },
  REQUEST_CHANGES: { label: 'Yêu cầu sửa', tone: 'in' },
}

const FILTERS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'PENDING_APPROVAL', label: 'Chờ duyệt' },
  { value: 'APPROVED', label: 'Đã duyệt' },
  { value: 'REJECTED', label: 'Từ chối' },
  { value: 'REQUEST_CHANGES', label: 'Cần sửa' },
  { value: 'DRAFT', label: 'Nháp' },
]

const ACTIVITY_MAP: Record<string, string> = {
  IRRIGATION: 'Tưới tiêu',
  FERTILIZING: 'Bón phân',
  SPRAYING: 'Phun thuốc',
  HARVEST: 'Thu hoạch',
  SOWING: 'Trồng mới',
  PRUNING: 'Đốn chè',
  OTHER: 'Khác'
}

const ACTIVITY_ICON: Record<string, typeof Leaf> = {
  IRRIGATION: Droplet,
  FERTILIZING: Sprout,
  SPRAYING: SprayCan,
  HARVEST: Scissors,
}

const RANGES = [
  { value: 'ALL', label: 'Mọi ngày' },
  { value: 'TODAY', label: 'Hôm nay' },
  { value: '7', label: '7 ngày qua' },
  { value: '30', label: '30 ngày qua' },
]

/** Midnight, local time, `back` days before today. */
function startOfDay(back = 0): number {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - back)
  return date.getTime()
}

/** Today, the rest of this week (from Monday), or earlier. */
function groupOf(entryDate: string): 'today' | 'week' | 'older' {
  const time = new Date(entryDate).getTime()
  if (new Date(entryDate).toDateString() === new Date().toDateString()) return 'today'
  return time >= startOfDay((new Date().getDay() + 6) % 7) ? 'week' : 'older'
}

/** As on the design: the spraying entry names what is sprayed. */
const TITLE_MAP: Record<string, string> = { SPRAYING: 'Phun thuốc BVTV' }

const GROUPS = [
  { key: 'today', label: 'Hôm nay' },
  { key: 'week', label: 'Tuần này' },
  { key: 'older', label: 'Trước đó' },
] as const

function formatDetail(detail: string | null | undefined): string {
  if (!detail) return ''
  if (ACTIVITY_MAP[detail]) return ACTIVITY_MAP[detail]
  
  for (const [key, label] of Object.entries(ACTIVITY_MAP)) {
    if (detail.startsWith(`${key}: `)) {
      return detail.replace(`${key}: `, `${label}: `)
    }
  }
  return detail
}

/** Opens the new-entry form with the values of an item the server refused (Sửa button). */
function prefillHref(payload: JournalPayload): string {
  const first = payload.activities[0] ?? {}
  const params = new URLSearchParams()
  const put = (key: string, value: unknown) => { if (value !== undefined && value !== null && value !== '') params.set(key, String(value)) }
  put('parcel', payload.parcel_id)
  put('activity', first.activity_type)
  put('product', first.product_name)
  put('dosage', first.dosage)
  put('withdrawal', first.withdrawal_days)
  return `/farmer/journal/new?${params}`
}

export function FarmerJournalList() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState('ALL')
  const [isDeleting, setIsDeleting] = useState(false)
  const [parcel, setParcel] = useState('ALL')
  const [range, setRange] = useState('ALL')
  // null: open "Trước đó" only when there is nothing newer to show
  const [olderOpen, setOlderOpen] = useState<boolean | null>(null)

  const fetchEntries = useCallback(() => {
    setLoading(true)
    fetchJson<{ data?: JournalEntry[] }>('/api/journal')
      .then(j => { setEntries(j.data || []); setLoadFailed(false) })
      .catch(() => { setEntries([]); setLoadFailed(true) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchEntries() }, [fetchEntries])
  const queue = useJournalOfflineQueue({ onSent: fetchEntries })

  async function handleWithdraw(id: string) {
    if (!confirm('Bạn có chắc chắn muốn rút nhật ký đang chờ duyệt này?')) return

    setIsDeleting(true)
    try {
      const res = await fetch(`/api/journal/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error?.message || 'Không thể rút nhật ký')
      }
      setEntries(prev => prev.filter(e => e.id !== id))
      setSelectedId(null)
    } finally {
      setIsDeleting(false)
    }
  }

  const parcelCodes = Array.from(new Set(entries.map(e => e.parcel_code).filter((code): code is string => !!code))).sort()
  const since = range === 'ALL' ? null : startOfDay(range === 'TODAY' ? 0 : Number(range) - 1)
  const shown = entries.filter(e =>
    (filter === 'ALL' || e.status === filter) &&
    (parcel === 'ALL' || e.parcel_code === parcel) &&
    (since === null || new Date(e.entry_date).getTime() >= since))
  const showOlder = olderOpen ?? shown.every(e => groupOf(e.entry_date) === 'older')
  const visible = shown.filter(e => showOlder || groupOf(e.entry_date) !== 'older')
  const selectedEntry = visible.find(e => e.id === selectedId) ?? visible[0] ?? null
  const status = (value: string) => STATUS_MAP[value] ?? { label: value, tone: 'mu' }
  const day = (value: string) => new Date(value).toLocaleDateString('vi-VN')
  const activityName = (value: string) => TITLE_MAP[value] || ACTIVITY_MAP[value] || value
  const dayTime = (value: string) => `${day(value)}, ${new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
  const detailRows: [string, React.ReactNode][] = selectedEntry ? [
    ['Ngày thực hiện', day(selectedEntry.entry_date)],
    ...(selectedEntry.parcel_code ? [['Thửa chè', selectedEntry.parcel_code] as [string, React.ReactNode]] : []),
    ['Sản phẩm', selectedEntry.activities?.[0]?.product_name || 'Không sử dụng'],
    ...(selectedEntry.activities?.[0]?.dosage ? [['Liều lượng', selectedEntry.activities[0].dosage] as [string, React.ReactNode]] : []),
    ...(selectedEntry.activities?.[0]?.performer ? [['Người thực hiện', selectedEntry.activities[0].performer] as [string, React.ReactNode]] : []),
    ...(selectedEntry.activities?.[0]?.withdrawal_days != null ? [['Thời gian cách ly (PHI)', `${selectedEntry.activities[0].withdrawal_days} ngày`] as [string, React.ReactNode]] : []),
    ['Ghi chú', selectedEntry.notes || 'Không có'],
  ] : []

  // Lịch sử lấy từ API nếu có; nếu không, dựng từ ngày tạo, ngày duyệt và trạng thái hiện tại
  const steps: { title: string; text?: string; done: boolean }[] = !selectedEntry ? []
    : selectedEntry.history?.length
      ? selectedEntry.history.map(h => ({ title: h.action, text: `${h.date}${h.note ? ` · ${h.note}` : ''}`, done: true }))
      : [
          ...(selectedEntry.created_at ? [{ title: 'Đã tạo nhật ký', text: dayTime(selectedEntry.created_at), done: true }] : []),
          ...(selectedEntry.status === 'PENDING_APPROVAL' ? [{ title: 'Chờ cán bộ kỹ thuật xem', text: 'Đang chờ cán bộ kỹ thuật xem và phê duyệt.', done: false }] : []),
          ...(selectedEntry.status === 'APPROVED' ? [{ title: 'Đã duyệt', text: selectedEntry.approved_at ? dayTime(selectedEntry.approved_at) : undefined, done: true }] : []),
          ...(selectedEntry.status === 'REJECTED' ? [{ title: 'Bị từ chối', done: true }] : []),
          ...(selectedEntry.status === 'REQUEST_CHANGES' ? [{ title: 'Cán bộ yêu cầu sửa', done: true }] : []),
        ]

  const icon = (type: string, size = 34) => {
    const Icon = ACTIVITY_ICON[type] ?? Leaf
    return <span className={styles.activityIcon}><Icon size={size} strokeWidth={1.4} aria-hidden="true" /></span>
  }

  const card = (e: JournalEntry) => (
    <button key={e.id} type="button" className={`${styles.entry} ${e.id === selectedEntry?.id ? styles.entryOn : ''}`}
      aria-pressed={e.id === selectedEntry?.id} onClick={() => setSelectedId(e.id)}>
      {icon(e.activity_type)}
      <span className={styles.entryText}>
        <strong>{activityName(e.activity_type)}</strong>
        <span className={kit.muted}>{e.parcel_code ? `${e.parcel_code} · ` : ''}{day(e.entry_date)}</span>
        <span>{e.notes || formatDetail(e.activities?.[0]?.activity_detail)}</span>
      </span>
      <span className={`${kit.tag} ${kit[status(e.status).tone]} ${styles.entryTag}`}>{status(e.status).label}</span>
    </button>
  )

  return (
    <div className={kit.page}>
      <div className={kit.hd}>
        <span className={kit.hico}><FileText size={28} aria-hidden="true" /></span>
        <div className={kit.hdText}>
          <h1 className={kit.h1}>Nhật ký của tôi</h1>
          <p className={kit.sub}>Ghi lại hoạt động canh tác và gửi cán bộ kỹ thuật duyệt.</p>
        </div>
        <Link className={kit.btn} href="/farmer/journal/new">
          <Plus size={16} aria-hidden="true" />
          Ghi nhật ký
        </Link>
      </div>

      {queue.pending > 0 && (
        <p className={styles.queueNote} role="status">{queue.pending} nhật ký đang chờ gửi. {QUEUED_MESSAGE}</p>
      )}
      {queue.failed.length > 0 && (
        <section className={styles.queueFailed} aria-label="Chưa gửi được">
          <h2>Chưa gửi được</h2>
          <ul>
            {queue.failed.map(item => (
              <li key={item.client_id}>
                <span>{item.payload.entry_date} · {item.last_error}</span>
                <Link className={kit.btn2} href={prefillHref(item.payload)} onClick={() => { void queue.discard(item.client_id) }}>Sửa</Link>
                <button type="button" className={kit.btn2} onClick={() => { void queue.discard(item.client_id) }}>Bỏ</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {loading ? (
        <div className={styles.empty}>Đang tải...</div>
      ) : loadFailed ? (
        <div className={styles.empty}>{LOAD_FAILED_MESSAGE}</div>
      ) : entries.length === 0 ? (
        <div className={styles.empty}>Bạn chưa ghi nhật ký nào.</div>
      ) : (
        <>
          <div className={styles.pills} role="group" aria-label="Lọc theo trạng thái">
            {FILTERS.map(item => (
              <button key={item.value} type="button" className={styles.pill} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>
                {item.label} <b>{item.value === 'ALL' ? entries.length : entries.filter(e => e.status === item.value).length}</b>
              </button>
            ))}
          </div>

          <div className={styles.toolbar}>
            <span className={styles.field}>
              <Layers size={20} strokeWidth={1.6} aria-hidden="true" />
              <select className={styles.select} aria-label="Lọc theo thửa" value={parcel} onChange={event => setParcel(event.target.value)}>
                <option value="ALL">Tất cả thửa chè</option>
                {parcelCodes.map(code => <option key={code} value={code}>{code}</option>)}
              </select>
              <ChevronDown size={18} aria-hidden="true" />
            </span>
            <span className={styles.field}>
              <Calendar size={20} strokeWidth={1.6} aria-hidden="true" />
              <select className={styles.select} aria-label="Lọc theo khoảng ngày" value={range} onChange={event => setRange(event.target.value)}>
                {RANGES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <ChevronDown size={18} aria-hidden="true" />
            </span>
            <span className={styles.count}>{shown.length} nhật ký</span>
          </div>

          <div className={styles.layout}>
            <div className={styles.entries}>
              {shown.length === 0 && <div className={styles.empty}>Không có nhật ký nào khớp bộ lọc.</div>}
              {GROUPS.map(group => {
                const items = shown.filter(e => groupOf(e.entry_date) === group.key)
                if (items.length === 0) return null
                if (group.key !== 'older') {
                  return (
                    <React.Fragment key={group.key}>
                      <h2 className={styles.groupHead}>{group.label}</h2>
                      {items.map(card)}
                    </React.Fragment>
                  )
                }
                return (
                  <React.Fragment key={group.key}>
                    <button type="button" className={styles.groupHead} aria-expanded={showOlder} onClick={() => setOlderOpen(!showOlder)}>
                      {showOlder ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
                      {group.label} ({items.length})
                    </button>
                    {showOlder && items.map(card)}
                  </React.Fragment>
                )
              })}
            </div>

            {selectedEntry && (
              <section className={`${kit.pn} ${styles.detail}`} aria-label="Chi tiết nhật ký">
                <div className={styles.detailHead}>
                  <h2>Chi tiết nhật ký</h2>
                  <span className={`${kit.tag} ${kit[status(selectedEntry.status).tone]}`}>{status(selectedEntry.status).label}</span>
                </div>
                <div className={styles.detailTitle}>
                  {icon(selectedEntry.activity_type, 28)}
                  <strong>{activityName(selectedEntry.activity_type)}</strong>
                </div>
                <dl className={styles.rows}>
                  {detailRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
                </dl>

                {selectedEntry.photo_url && (
                  <div className={styles.photo}>
                    <strong>Ảnh thực tế</strong>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={selectedEntry.photo_url} alt="Journal attachment" />
                  </div>
                )}

                {selectedEntry.review_note && (
                  <div className={`${styles.rejectBox} ${styles.inset}`}>
                    <strong>{selectedEntry.status === 'REQUEST_CHANGES' ? 'Yêu cầu sửa:' : 'Lý do từ chối:'}</strong>
                    <p>{selectedEntry.review_note}</p>
                  </div>
                )}

                <div className={styles.history}>
                  <strong>Lịch sử xử lý</strong>
                  {steps.length ? (
                    <ol>
                      {steps.map((step, i) => (
                        <li key={i} className={step.done ? styles.done : styles.waiting}>
                          <b>{step.title}</b>
                          {step.text && <span>{step.text}</span>}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className={kit.muted}>Chưa có lịch sử</p>
                  )}
                </div>

                {(selectedEntry.status === 'REQUEST_CHANGES' || selectedEntry.status === 'REJECTED' || selectedEntry.status === 'DRAFT') && (
                  <div className={styles.foot}>
                    <Link className={kit.btn} href={`/farmer/journal/${selectedEntry.id}/edit`}>
                      {selectedEntry.status === 'DRAFT' ? <SprayCan size={16} aria-hidden="true" /> : <Pencil size={16} aria-hidden="true" />}
                      {selectedEntry.status === 'DRAFT' ? 'Đã phun' : 'Sửa lại'}
                    </Link>
                  </div>
                )}

                {selectedEntry.status === 'PENDING_APPROVAL' && (
                  <div className={styles.foot}>
                    <button type="button" className={`${kit.btn2} ${styles.withdraw}`} onClick={() => handleWithdraw(selectedEntry.id)} disabled={isDeleting}>
                      <Trash2 size={16} aria-hidden="true" />
                      {isDeleting ? 'Đang rút...' : 'Rút nhật ký'}
                    </button>
                  </div>
                )}
              </section>
            )}
          </div>
        </>
      )}
    </div>
  )
}
