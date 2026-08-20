// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect, useState, useCallback } from 'react'
import styles from '../approve.module.css'

interface JournalEntry {
  id: string
  entry_date: string
  activity_type: string
  performed_by: string
  notes: string | null
  activities: { activity_detail: string; product_name: string | null }[]
}

export function ApproveList() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchEntries = useCallback(() => {
    setLoading(true)
    fetch('/api/journal?status=PENDING_APPROVAL')
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(j => setEntries(j.data || []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === entries.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(entries.map(e => e.id)))
    }
  }

  async function handleApprove() {
    if (selected.size === 0) return
    setApproving(true)
    setMessage(null)

    try {
      const res = await fetch('/api/journal/batch-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_ids: Array.from(selected) }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error?.message || 'Lỗi duyệt nhật ký')
      }
      const data = await res.json()
      const { approved_count, failed_ids } = data.data
      setMessage({
        type: 'success',
        text: `Đã duyệt ${approved_count} nhật ký thành công.${failed_ids.length > 0 ? ` ${failed_ids.length} thất bại.` : ''}`,
      })
      setSelected(new Set())
      fetchEntries()
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Lỗi không xác định' })
    } finally {
      setApproving(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Duyệt nhật ký</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {selected.size > 0 && (
            <span className={styles.selectedCount}>Đã chọn: {selected.size}</span>
          )}
          <button
            className={styles.approveBtn}
            disabled={selected.size === 0 || approving}
            onClick={handleApprove}
          >
            {approving ? 'Đang duyệt...' : `✓ Duyệt (${selected.size})`}
          </button>
        </div>
      </div>

      {message && (
        <div className={message.type === 'success' ? styles.successBanner : styles.errorBanner}>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className={styles.empty}>Đang tải...</div>
      ) : entries.length === 0 ? (
        <div className={styles.empty}>🎉 Không có nhật ký nào đang chờ duyệt!</div>
      ) : (
        <>
          <label className={styles.selectAll}>
            <input
              type="checkbox"
              checked={selected.size === entries.length}
              onChange={toggleAll}
            />
            Chọn tất cả ({entries.length})
          </label>

          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: '40px' }}></th>
                <th>Ngày</th>
                <th>Hoạt động</th>
                <th>Người thực hiện</th>
                <th>Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(e.id)}
                      onChange={() => toggleSelect(e.id)}
                    />
                  </td>
                  <td>{new Date(e.entry_date).toLocaleDateString('vi-VN')}</td>
                  <td>{e.activity_type}</td>
                  <td>{e.performed_by}</td>
                  <td>{e.activities?.[0]?.activity_detail ?? e.notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
