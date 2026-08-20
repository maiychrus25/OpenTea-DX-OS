// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState, useEffect } from 'react'
import { Pill } from '@/components/ui'
import styles from '../journal.module.css'
import { JournalForm } from './JournalForm'

interface JournalEntry {
  id: string
  parcel_code?: string
  parcel_id?: string
  activity_type?: string
  entry_date?: string
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'REQUEST_CHANGES'
  hasDiseaseWarning?: boolean
}

export function OfficerJournalApproval() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [rejectEntryId, setRejectEntryId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectType, setRejectType] = useState<'REJECTED' | 'REQUEST_CHANGES'>('REJECTED')
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)

  const load = async () => {
      try {
        const res = await fetch('/api/journal')
        if (res.ok) {
          const data = await res.json()
          setEntries(data.data || [])
        }
      } catch {
        // Error loading journal entries — handled silently
      } finally {
        setIsLoading(false)
      }
    }
  useEffect(() => {
    load()
  }, [])

  const handleApprove = async (id: string) => {
    try {
      const res = await fetch('/api/journal/batch-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_ids: [id], isApproved: true })
      })
      if (res.ok) {
        setEntries(prev => prev.map(e => e.id === id ? { ...e, status: 'APPROVED' } : e))
      }
    } catch {
      // Error approving journal entry — handled silently
    }
  }

  const handleReject = (id: string) => {
    setRejectEntryId(id)
    setRejectReason('')
    setRejectType('REJECTED')
  }

  const handleRequestChanges = (id: string) => {
    setRejectEntryId(id)
    setRejectReason('')
    setRejectType('REQUEST_CHANGES')
  }

  const confirmReject = async () => {
    if (!rejectEntryId || !rejectReason.trim()) return
    try {
      const res = await fetch('/api/journal/batch-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_ids: [rejectEntryId], isApproved: false, rejectionReason: rejectReason })
      })
      if (res.ok) {
        setEntries(prev => prev.map(e => e.id === rejectEntryId ? { ...e, status: rejectType } : e))
        setRejectEntryId(null)
      }
    } catch {
      // Error rejecting journal entry — handled silently
    }
  }

  const hasWarning = entries.some(e => e.hasDiseaseWarning && e.status === 'PENDING_APPROVAL')

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            NHẬT KÝ CANH TÁC
          </span>
          <h1 className={styles.title}>Kiểm tra và phê duyệt nhật ký</h1>
        </div>
        <button className={styles.createBtn} onClick={() => setIsCreating(true)}>+ Tạo nhật ký</button>
      </div>

      {hasWarning && (
        <div className={styles.notice}>
          AI phát hiện dấu hiệu sâu tơi. Kiểm tra trước khi phê duyệt.
        </div>
      )}

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Mã thửa</th>
            <th>Cây trồng - Hoạt động</th>
            <th>Ngày</th>
            <th>Trạng thái</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={5} className={styles.emptyCell}>
                Đang tải dữ liệu...
              </td>
            </tr>
          ) : entries.length === 0 ? (
            <tr>
              <td colSpan={5} className={styles.emptyCell}>
                Chưa có nhật ký nào cần duyệt.
              </td>
            </tr>
          ) : (
            entries.map(e => (
              <tr key={e.id}>
                <td>{e.parcel_code || e.parcel_id || e.id.substring(0, 8)}</td>
                <td>{e.activity_type || 'Không có'}</td>
                <td>{e.entry_date ? new Date(e.entry_date).toLocaleDateString('vi-VN') : ''}</td>
                <td>
                  <Pill tone={e.status === 'PENDING_APPROVAL' ? 'amber' : e.status === 'APPROVED' ? 'green' : e.status === 'REJECTED' ? 'neutral' : 'blue'}>
                    {e.status === 'PENDING_APPROVAL' ? 'Chờ duyệt' : e.status === 'APPROVED' ? 'Đã duyệt' : e.status === 'REQUEST_CHANGES' ? 'Cần sửa' : 'Từ chối'}
                  </Pill>
                </td>
                <td>
                  {e.status === 'PENDING_APPROVAL' && (
                    <div className={styles.flexActions}>
                      <button className={styles.approveBtn} onClick={() => handleApprove(e.id)}>Duyệt</button>
                      <button className={styles.rejectBtn} onClick={() => handleRequestChanges(e.id)}>Yêu cầu sửa</button>
                      <button className={styles.rejectBtn} onClick={() => handleReject(e.id)}>Từ chối</button>
                    </div>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {rejectEntryId && (
        <div className={styles.overlay} onClick={() => setRejectEntryId(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <h2 className={styles.modalTitle}>
              {rejectType === 'REJECTED' ? 'Từ chối nhật ký' : 'Yêu cầu sửa nhật ký'}
            </h2>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Lý do</label>
              <textarea 
                className={styles.formTextarea} 
                value={rejectReason} 
                onChange={e => setRejectReason(e.target.value)} 
                placeholder="Nhập lý do để nông dân biết..." 
                rows={4}
              />
            </div>
            <div className={styles.formActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => setRejectEntryId(null)}>Hủy</button>
              <button type="button" className={styles.submitBtn} style={rejectType === 'REJECTED' ? { backgroundColor: 'var(--color-error)' } : {}} onClick={confirmReject}>
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {isCreating && (
        <div className={styles.overlay} onClick={() => setIsCreating(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <JournalForm 
              onSuccess={() => {
                setIsCreating(false)
                load()
              }} 
              onCancel={() => setIsCreating(false)} 
            />
          </div>
        </div>
      )}
    </div>
  )
}
