// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Pill } from '@/components/ui'
import styles from '../journal.module.css'

interface JournalEntry {
  id: string
  entry_date: string
  activity_type: string
  performed_by: string
  status: string
  notes: string | null
  activities: { activity_detail: string; product_name: string | null; dosage?: string; performer?: string; withdrawal_days?: number }[]
  history?: { date: string, action: string, note?: string }[]
  rejectReason?: string
}

const STATUS_MAP: Record<string, { label: string; tone: 'amber' | 'green' | 'neutral' | 'blue' }> = {
  PENDING_APPROVAL: { label: 'Chờ duyệt', tone: 'amber' },
  APPROVED: { label: 'Đã duyệt', tone: 'green' },
  DRAFT: { label: 'Bản nháp', tone: 'neutral' },
  REJECTED: { label: 'Từ chối', tone: 'blue' },
}

export function FarmerJournalList() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const fetchEntries = useCallback(() => {
    setLoading(true)
    fetch('/api/journal')
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(j => setEntries(j.data || []))
      .catch(() => setEntries([]))
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
      setSelectedEntry(null)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Nhật ký của tôi</h1>
        <Link className={styles.createBtn} href="/farmer/journal/new">+ Ghi nhật ký</Link>
      </div>

      {loading ? (
        <div className={styles.empty}>Đang tải...</div>
      ) : entries.length === 0 ? (
        <div className={styles.empty}>Bạn chưa ghi nhật ký nào.</div>
      ) : (
        <div className={styles.cardList}>
          {entries.map(e => {
            const statusInfo = STATUS_MAP[e.status] ?? { label: e.status, tone: 'neutral' as const }
            return (
              <button key={e.id} className={`${styles.card} ${styles.cardButton}`} onClick={() => setSelectedEntry(e)}>
                <div className={styles.cardTop}>
                  <span className={styles.cardDate}>{new Date(e.entry_date).toLocaleDateString('vi-VN')}</span>
                  <Pill tone={statusInfo.tone}>{statusInfo.label}</Pill>
                </div>
                <span className={styles.cardActivity}>{e.activity_type}</span>
                {e.activities?.[0] && (
                  <span className={styles.cardDetail}>{e.activities[0].activity_detail}</span>
                )}
                {e.notes && <span className={styles.cardDetail}>{e.notes}</span>}
              </button>
            )
          })}
        </div>
      )}

      {selectedEntry && (
        <div className={styles.overlay} onClick={() => setSelectedEntry(null)}>
          <div className={`${styles.modal} ${styles.detailModal}`} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Chi tiết Nhật ký</h2>
            
            <div className={styles.detailBody}>
              <div className={styles.detailRow}>
                <strong>Ngày:</strong>
                <span>{new Date(selectedEntry.entry_date).toLocaleDateString('vi-VN')}</span>
              </div>
              <div className={styles.detailRow}>
                <strong>Hoạt động:</strong>
                <span>{selectedEntry.activity_type}</span>
              </div>
              <div className={styles.detailRow}>
                <strong>Sản phẩm:</strong>
                <span>{selectedEntry.activities?.[0]?.product_name || 'Không sử dụng'}</span>
              </div>
              {selectedEntry.activities?.[0]?.dosage && (
                <div className={styles.detailRow}>
                  <strong>Liều lượng:</strong>
                  <span>{selectedEntry.activities[0].dosage}</span>
                </div>
              )}
              {selectedEntry.activities?.[0]?.performer && (
                <div className={styles.detailRow}>
                  <strong>Người thực hiện:</strong>
                  <span>{selectedEntry.activities[0].performer}</span>
                </div>
              )}
              {selectedEntry.activities?.[0]?.withdrawal_days !== undefined && (
                <div className={styles.detailRow}>
                  <strong>Cách ly:</strong>
                  <span>{selectedEntry.activities[0].withdrawal_days} ngày</span>
                </div>
              )}
              <div className={styles.detailRow}>
                <strong>Ghi chú:</strong>
                <span>{selectedEntry.notes || 'Không có'}</span>
              </div>

              {selectedEntry.rejectReason && (
                <div className={styles.rejectBox}>
                  <strong>Lý do từ chối:</strong>
                  <p>{selectedEntry.rejectReason}</p>
                </div>
              )}

              <div className={styles.historyBox}>
                <strong>Lịch sử duyệt:</strong>
                {selectedEntry.history ? (
                  <ul>
                    {selectedEntry.history.map((h, i) => (
                      <li key={i}>
                        <span>{h.date}</span> - <strong>{h.action}</strong>
                        {h.note && <span> ({h.note})</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Chưa có lịch sử</p>
                )}
              </div>
            </div>

            <div className={styles.formActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => setSelectedEntry(null)}>Đóng</button>
              {selectedEntry.status === 'PENDING_APPROVAL' && (
                <button type="button" className={styles.dangerBtn} onClick={() => handleWithdraw(selectedEntry.id)} disabled={isDeleting}>
                  {isDeleting ? 'Đang rút...' : 'Rút nhật ký'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
