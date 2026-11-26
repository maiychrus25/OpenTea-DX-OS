// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { FileText, Plus, Trash2 } from 'lucide-react'
import kit from '@/components/features/farmer-web/kit.module.css'
import styles from '../journal.module.css'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'

interface JournalEntry {
  id: string
  entry_date: string
  parcel_code?: string
  activity_type: string
  performed_by: string
  status: string
  notes: string | null
  activities: { activity_detail: string; product_name: string | null; dosage?: string; performer?: string; withdrawal_days?: number }[]
  history?: { date: string, action: string, note?: string }[]
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
  SOWING: 'Gieo sạ',
  OTHER: 'Khác'
}

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

export function FarmerJournalList() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState('ALL')
  const [isDeleting, setIsDeleting] = useState(false)

  const fetchEntries = useCallback(() => {
    setLoading(true)
    fetchJson<{ data?: JournalEntry[] }>('/api/journal')
      .then(j => { setEntries(j.data || []); setLoadFailed(false) })
      .catch(() => { setEntries([]); setLoadFailed(true) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchEntries() }, [fetchEntries])

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

  const shown = filter === 'ALL' ? entries : entries.filter(e => e.status === filter)
  const selectedEntry = shown.find(e => e.id === selectedId) ?? shown[0] ?? null
  const status = (value: string) => STATUS_MAP[value] ?? { label: value, tone: 'mu' }
  const day = (value: string) => new Date(value).toLocaleDateString('vi-VN')
  const activityName = (value: string) => ACTIVITY_MAP[value] || value
  const detailRows: [string, React.ReactNode][] = selectedEntry ? [
    ['Ngày', day(selectedEntry.entry_date)],
    ...(selectedEntry.parcel_code ? [['Thửa', selectedEntry.parcel_code] as [string, React.ReactNode]] : []),
    ['Hoạt động', activityName(selectedEntry.activity_type)],
    ['Sản phẩm', selectedEntry.activities?.[0]?.product_name || 'Không sử dụng'],
    ...(selectedEntry.activities?.[0]?.dosage ? [['Liều lượng', selectedEntry.activities[0].dosage] as [string, React.ReactNode]] : []),
    ...(selectedEntry.activities?.[0]?.performer ? [['Người thực hiện', selectedEntry.activities[0].performer] as [string, React.ReactNode]] : []),
    ...(selectedEntry.activities?.[0]?.withdrawal_days != null ? [['Cách ly', `${selectedEntry.activities[0].withdrawal_days} ngày`] as [string, React.ReactNode]] : []),
    ['Ghi chú', selectedEntry.notes || 'Không có'],
  ] : []

  return (
    <div className={kit.page}>
      <div className={kit.hd}>
        <span className={kit.hico}><FileText size={28} aria-hidden="true" /></span>
        <div className={kit.hdText}>
          <h1 className={kit.h1}>Nhật ký của tôi</h1>
          <p className={kit.sub}>Mọi lần phun thuốc, bón phân, tưới tiêu, thu hoạch — gửi cán bộ kỹ thuật duyệt</p>
        </div>
        <Link className={kit.btn} href="/farmer/journal/new">
          <Plus size={16} aria-hidden="true" />
          Ghi nhật ký
        </Link>
      </div>

      {loading ? (
        <div className={styles.empty}>Đang tải...</div>
      ) : loadFailed ? (
        <div className={styles.empty}>{LOAD_FAILED_MESSAGE}</div>
      ) : entries.length === 0 ? (
        <div className={styles.empty}>Bạn chưa ghi nhật ký nào.</div>
      ) : (
        <>
          <div className={styles.filters} role="group" aria-label="Lọc theo trạng thái">
            {FILTERS.map(item => (
              <button key={item.value} type="button" className={kit.seg} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>
                {item.label} ({item.value === 'ALL' ? entries.length : entries.filter(e => e.status === item.value).length})
              </button>
            ))}
          </div>

          <div className={kit.cols}>
            <div className={styles.entries}>
              {shown.length === 0 && <div className={styles.empty}>Không có nhật ký ở trạng thái này.</div>}
              {shown.map(e => (
                <button key={e.id} type="button" className={`${styles.entry} ${e.id === selectedEntry?.id ? styles.entryOn : ''}`}
                  aria-pressed={e.id === selectedEntry?.id} onClick={() => setSelectedId(e.id)}>
                  <span className={styles.entryTop}>
                    <span className={`${kit.mono} ${kit.grow} ${kit.muted}`}>{day(e.entry_date)}</span>
                    <span className={`${kit.tag} ${kit[status(e.status).tone]}`}>{status(e.status).label}</span>
                  </span>
                  <strong>{activityName(e.activity_type)}</strong>
                  {e.parcel_code && <span className={kit.muted}>{e.parcel_code}</span>}
                  {e.activities?.[0] && <span className={kit.muted}>{formatDetail(e.activities[0].activity_detail)}</span>}
                  {e.notes && <span>{e.notes}</span>}
                </button>
              ))}
            </div>

            {selectedEntry && (
              <section className={`${kit.pn} ${styles.detail}`} aria-label="Chi tiết nhật ký">
                <div className={kit.ph}>
                  <h2>Chi tiết nhật ký</h2>
                  <span className={`${kit.tag} ${kit[status(selectedEntry.status).tone]}`}>{status(selectedEntry.status).label}</span>
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
                  {selectedEntry.history?.length ? (
                    <ol>
                      {selectedEntry.history.map((h, i) => (
                        <li key={i}><strong>{h.action}</strong><span>{h.date}{h.note ? ` · ${h.note}` : ''}</span></li>
                      ))}
                    </ol>
                  ) : (
                    <p className={kit.muted}>Chưa có lịch sử</p>
                  )}
                </div>

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
