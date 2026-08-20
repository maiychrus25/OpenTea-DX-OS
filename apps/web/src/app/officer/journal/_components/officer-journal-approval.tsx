// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState } from 'react'
import { Pill } from '@/components/ui'
import styles from '../journal.module.css'

interface JournalEntryMock {
  id: string
  parcelCode: string
  cropActivity: string
  date: string
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'REQUEST_CHANGES'
  hasDiseaseWarning?: boolean
}

const INITIAL_MOCK_DATA: JournalEntryMock[] = [
  { id: '1', parcelCode: 'TP-014', cropActivity: 'Cải ngọt - Phun thuốc BVTV', date: '10/08/2026', status: 'PENDING_APPROVAL', hasDiseaseWarning: true },
  { id: '2', parcelCode: 'TP-021', cropActivity: 'Xà lách - Bón phân hữu cơ', date: '11/08/2026', status: 'APPROVED' },
  { id: '3', parcelCode: 'TP-008', cropActivity: 'Dưa leo - Thu hoạch', date: '12/08/2026', status: 'PENDING_APPROVAL' },
]

export function OfficerJournalApproval() {
  const [entries, setEntries] = useState<JournalEntryMock[]>(INITIAL_MOCK_DATA)
  const [rejectEntryId, setRejectEntryId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectType, setRejectType] = useState<'REJECTED' | 'REQUEST_CHANGES'>('REJECTED')

  const handleApprove = (id: string) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, status: 'APPROVED' } : e))
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

  const confirmReject = () => {
    if (!rejectEntryId || !rejectReason.trim()) return
    setEntries(prev => prev.map(e => e.id === rejectEntryId ? { ...e, status: rejectType } : e))
    setRejectEntryId(null)
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
        <button className={styles.createBtn}>+ Tạo nhật ký</button>
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
          {entries.map(e => (
            <tr key={e.id}>
              <td>{e.parcelCode}</td>
              <td>{e.cropActivity}</td>
              <td>{e.date}</td>
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
          ))}
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
    </div>
  )
}
