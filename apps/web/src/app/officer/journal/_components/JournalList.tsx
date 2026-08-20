// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { Pill } from '@/components/ui'
import { JournalForm } from './JournalForm'
import styles from '../journal.module.css'

interface JournalEntry {
  id: string
  parcel_id: string
  entry_date: string
  activity_type: string
  performed_by: string
  status: string
  notes: string | null
  activities: { activity_detail: string; product_name: string | null; dosage: string | null; withdrawal_days: number | null }[]
}

const STATUS_LABELS: Record<string, string> = {
  PENDING_APPROVAL: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  DRAFT: 'Bản nháp',
  REJECTED: 'Từ chối',
}

function statusTone(status: string): 'amber' | 'green' | 'neutral' | 'blue' {
  switch (status) {
    case 'PENDING_APPROVAL': return 'amber'
    case 'APPROVED': return 'green'
    case 'REJECTED': return 'blue'
    default: return 'neutral'
  }
}

export function JournalList() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [filter, setFilter] = useState<string>('all')
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchEntries = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filter !== 'all') params.set('status', filter)
    fetch(`/api/journal?${params.toString()}`)
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(j => setEntries(j.data || []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [filter])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  function handleCreated() {
    setShowForm(false)
    fetchEntries()
  }

  const filters = [
    { key: 'all', label: 'Tất cả' },
    { key: 'PENDING_APPROVAL', label: 'Chờ duyệt' },
    { key: 'APPROVED', label: 'Đã duyệt' },
  ]

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Nhật ký canh tác</h1>
        <button className={styles.createBtn} onClick={() => setShowForm(true)}>+ Ghi nhật ký</button>
      </div>

      <div className={styles.filterRow}>
        {filters.map(f => (
          <button
            key={f.key}
            className={filter === f.key ? styles.filterBtnActive : styles.filterBtn}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.empty}>Đang tải...</div>
      ) : entries.length === 0 ? (
        <div className={styles.empty}>Chưa có nhật ký nào.</div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Ngày</th>
              <th>Hoạt động</th>
              <th>Người thực hiện</th>
              <th>Chi tiết</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(e => (
              <tr key={e.id}>
                <td>{new Date(e.entry_date).toLocaleDateString('vi-VN')}</td>
                <td>{e.activity_type}</td>
                <td>{e.performed_by}</td>
                <td>{e.activities?.[0]?.activity_detail ?? e.notes ?? '—'}</td>
                <td>
                  <Pill tone={statusTone(e.status)}>
                    {STATUS_LABELS[e.status] ?? e.status}
                  </Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showForm && (
        <div className={styles.overlay} onClick={() => setShowForm(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <JournalForm onSuccess={handleCreated} onCancel={() => setShowForm(false)} />
          </div>
        </div>
      )}
    </div>
  )
}
