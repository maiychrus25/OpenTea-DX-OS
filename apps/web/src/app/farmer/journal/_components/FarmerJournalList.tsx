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
  activities: { activity_detail: string; product_name: string | null }[]
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
              <div key={e.id} className={styles.card}>
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
    </div>
  )
}
