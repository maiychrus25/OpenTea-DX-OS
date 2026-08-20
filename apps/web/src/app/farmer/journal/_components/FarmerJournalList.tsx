// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { Pill } from '@/components/ui'
import { FarmerJournalForm } from './FarmerJournalForm'
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
  const [showForm, setShowForm] = useState(false)
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

  function handleCreated() {
    setShowForm(false)
    fetchEntries()
  }

  function handleDraftDelete(id: string) {
    if (confirm('Bạn có chắc chắn muốn xóa bản nháp này? Hành động này không thể hoàn tác.')) {
      setIsDeleting(true)
      // Mock API call
      setTimeout(() => {
        setEntries(prev => prev.filter(e => e.id !== id))
        setSelectedEntry(null)
        setIsDeleting(false)
      }, 500)
    }
  }

  function handleDraftEdit(entry: JournalEntry) {
    // Mock edit by showing form
    setSelectedEntry(null)
    setShowForm(true)
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Nhật ký của tôi</h1>
        <button className={styles.createBtn} onClick={() => setShowForm(true)}>+ Ghi nhật ký</button>
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
              <div key={e.id} className={styles.card} onClick={() => setSelectedEntry(e)} style={{ cursor: 'pointer' }}>
                <div className={styles.cardTop}>
                  <span className={styles.cardDate}>{new Date(e.entry_date).toLocaleDateString('vi-VN')}</span>
                  <Pill tone={statusInfo.tone}>{statusInfo.label}</Pill>
                </div>
                <span className={styles.cardActivity}>{e.activity_type}</span>
                {e.activities?.[0] && (
                  <span className={styles.cardDetail}>{e.activities[0].activity_detail}</span>
                )}
                {e.notes && <span className={styles.cardDetail}>📝 {e.notes}</span>}
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <div className={styles.overlay} onClick={() => setShowForm(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <FarmerJournalForm onSuccess={handleCreated} onCancel={() => setShowForm(false)} />
          </div>
        </div>
      )}

      {selectedEntry && (
        <div className={styles.overlay} onClick={() => setSelectedEntry(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <h2 className={styles.modalTitle}>Chi tiết Nhật ký</h2>
            
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <strong>Ngày:</strong>
                <span>{new Date(selectedEntry.entry_date).toLocaleDateString('vi-VN')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <strong>Hoạt động:</strong>
                <span>{selectedEntry.activity_type}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <strong>Sản phẩm:</strong>
                <span>{selectedEntry.activities?.[0]?.product_name || 'Không sử dụng'}</span>
              </div>
              {selectedEntry.activities?.[0]?.dosage && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <strong>Liều lượng:</strong>
                  <span>{selectedEntry.activities[0].dosage}</span>
                </div>
              )}
              {selectedEntry.activities?.[0]?.performer && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <strong>Người thực hiện:</strong>
                  <span>{selectedEntry.activities[0].performer}</span>
                </div>
              )}
              {selectedEntry.activities?.[0]?.withdrawal_days !== undefined && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <strong>Cách ly:</strong>
                  <span>{selectedEntry.activities[0].withdrawal_days} ngày</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <strong>Ghi chú:</strong>
                <span>{selectedEntry.notes || 'Không có'}</span>
              </div>

              {selectedEntry.rejectReason && (
                <div style={{ padding: '1rem', background: '#ffebee', borderRadius: '8px', marginBottom: '1rem' }}>
                  <strong style={{ color: 'var(--color-error)' }}>Lý do từ chối:</strong>
                  <p style={{ margin: '0.5rem 0 0 0', color: 'var(--color-error)' }}>{selectedEntry.rejectReason}</p>
                </div>
              )}

              <div style={{ padding: '1rem', background: 'var(--color-surface-sunken)', borderRadius: '8px' }}>
                <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Lịch sử duyệt:</strong>
                {selectedEntry.history ? (
                  <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.875rem' }}>
                    {selectedEntry.history.map((h, i) => (
                      <li key={i} style={{ marginBottom: '0.25rem' }}>
                        <span style={{ color: 'var(--color-text-muted)' }}>{h.date}</span> - <strong>{h.action}</strong>
                        {h.note && <span> ({h.note})</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Chưa có lịch sử</p>
                )}
              </div>
            </div>

            <div className={styles.formActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => setSelectedEntry(null)}>Đóng</button>
              {selectedEntry.status === 'DRAFT' && (
                <>
                  <button type="button" className={styles.cancelBtn} style={{ color: 'var(--color-error)' }} onClick={() => handleDraftDelete(selectedEntry.id)} disabled={isDeleting}>
                    {isDeleting ? 'Đang xóa...' : 'Xóa bản nháp'}
                  </button>
                  <button type="button" className={styles.submitBtn} onClick={() => handleDraftEdit(selectedEntry)}>Sửa</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
