// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Pill } from '@/components/ui'
import styles from '../journal.module.css'
import { JournalForm } from './JournalForm'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'

interface JournalEntry {
  id: string
  parcel_code?: string
  parcel_id?: string
  activity_type?: string
  entry_date?: string
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'REQUEST_CHANGES'
  hasDiseaseWarning?: boolean
  performed_by?: string
  notes?: string
  weather_temperature?: number
  weather_condition?: string
  activities?: {
    activity_detail: string
    product_name: string | null
    dosage: string | null
    withdrawal_days: number | null
  }[]
  photo_url?: string
}

const ACTIVITY_LABELS: Record<string, string> = {
  SOWING: 'Gieo sạ',
  FERTILIZING: 'Bón phân',
  SPRAYING: 'Phun thuốc',
  IRRIGATION: 'Tưới tiêu',
  HARVEST: 'Thu hoạch',
  OTHER: 'Khác',
}

function formatDetail(detail: string | null | undefined): string {
  if (!detail) return '—'
  if (ACTIVITY_LABELS[detail]) return ACTIVITY_LABELS[detail]
  
  for (const [key, label] of Object.entries(ACTIVITY_LABELS)) {
    if (detail.startsWith(`${key}: `)) {
      return detail.replace(`${key}: `, `${label}: `)
    }
  }
  return detail
}

interface OfficerJournalApprovalProps {
  householdId?: string
}

export function OfficerJournalApproval({ householdId }: OfficerJournalApprovalProps) {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [rejectEntryId, setRejectEntryId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectType, setRejectType] = useState<'REJECTED' | 'REQUEST_CHANGES'>('REJECTED')
  const [viewEntryId, setViewEntryId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      const url = householdId
        ? `/api/journal?householdId=${householdId}`
        : '/api/journal'
      const data = await fetchJson<{ data?: JournalEntry[] }>(url)
      setEntries(data.data || [])
      setLoadFailed(false)
    } catch {
      setLoadFailed(true)
    } finally {
      setIsLoading(false)
    }
  }, [householdId])

  useEffect(() => {
    load()
  }, [load])

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

      <div className={styles.tableScroll}>
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
            ) : loadFailed ? (
              <tr>
                <td colSpan={5} className={styles.emptyCell}>
                  {LOAD_FAILED_MESSAGE}
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
                  <td>{formatDetail(e.activities?.[0]?.activity_detail)}</td>
                  <td>{e.entry_date ? new Date(e.entry_date).toLocaleDateString('vi-VN') : ''}</td>
                  <td>
                    <Pill tone={e.status === 'PENDING_APPROVAL' ? 'amber' : e.status === 'APPROVED' ? 'green' : e.status === 'REJECTED' ? 'neutral' : 'blue'}>
                      {e.status === 'PENDING_APPROVAL' ? 'Chờ duyệt' : e.status === 'APPROVED' ? 'Đã duyệt' : e.status === 'REQUEST_CHANGES' ? 'Cần sửa' : 'Từ chối'}
                    </Pill>
                  </td>
                  <td>
                    {e.status === 'PENDING_APPROVAL' && (
                      <div className={styles.flexActions}>
                        <button className={`${styles.viewBtn} ${styles.viewBtnPrimary}`} onClick={() => setViewEntryId(e.id)}>Xem</button>
                        <button className={styles.approveBtn} onClick={() => handleApprove(e.id)}>Duyệt</button>
                        <button className={styles.rejectBtn} onClick={() => handleRequestChanges(e.id)}>Yêu cầu sửa</button>
                        <button className={styles.rejectBtn} onClick={() => handleReject(e.id)}>Từ chối</button>
                      </div>
                    )}
                    {e.status !== 'PENDING_APPROVAL' && (
                      <button className={`${styles.viewBtn} ${styles.viewBtnSecondary}`} onClick={() => setViewEntryId(e.id)}>Xem</button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
              <button type="button" className={styles.submitBtn} style={rejectType === 'REJECTED' ? { backgroundColor: 'var(--color-danger)', color: 'var(--color-ink-inverse)' } : {}} onClick={confirmReject}>
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

      {viewEntryId && (
        <div className={styles.overlay} onClick={() => setViewEntryId(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={`${styles.modalTitle} ${styles.modalTitleMargin0}`}>Chi tiết Nhật ký</h2>
              <button onClick={() => setViewEntryId(null)} className={styles.closeBtn}>&times;</button>
            </div>
            
            {(() => {
              const entry = entries.find(e => e.id === viewEntryId)
              if (!entry) return null
              
              return (
                <div className={styles.detailContainer}>
                  <div className={styles.detailGrid}>
                    <div>
                      <span className={styles.detailLabel}>Mã thửa</span>
                      <strong className={styles.detailValue}>{entry.parcel_code || entry.parcel_id || 'N/A'}</strong>
                    </div>
                    <div>
                      <span className={styles.detailLabel}>Ngày thực hiện</span>
                      <strong className={styles.detailValue}>{entry.entry_date ? new Date(entry.entry_date).toLocaleDateString('vi-VN') : 'N/A'}</strong>
                    </div>
                    <div>
                      <span className={styles.detailLabel}>Người thực hiện</span>
                      <strong className={styles.detailValue}>{entry.performed_by || 'N/A'}</strong>
                    </div>
                    <div>
                      <span className={styles.detailLabel}>Thời tiết</span>
                      <strong className={styles.detailValue}>
                        {entry.weather_temperature ? `${entry.weather_temperature}°C` : 'N/A'} 
                        {entry.weather_condition ? ` - ${entry.weather_condition}` : ''}
                      </strong>
                    </div>
                  </div>

                  <div className={styles.sectionContainer}>
                    <h3 className={styles.sectionTitle}>Ghi chú / Quan sát</h3>
                    <p className={styles.notesContent}>
                      {entry.notes || 'Không có ghi chú.'}
                    </p>
                  </div>
                  
                  {entry.photo_url && (
                    <div className={styles.sectionContainer}>
                      <h3 className={styles.sectionTitle}>Hình ảnh thực tế</h3>
                      <div className="mt-2 w-full rounded-md overflow-hidden bg-muted flex justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={entry.photo_url} alt="Journal attachment" className="max-w-full max-h-[300px] object-contain" />
                      </div>
                    </div>
                  )}

                  <div className={styles.sectionContainer}>
                    <h3 className={styles.sectionTitle}>Các hoạt động</h3>
                    {entry.activities && entry.activities.length > 0 ? (
                      <div className={styles.activityList}>
                        {entry.activities.map((act, idx) => (
                          <div key={idx} className={styles.activityCard}>
                            <div className={styles.activityDetailName}>{formatDetail(act.activity_detail)}</div>
                            <div className={styles.activityMeta}>
                              {act.product_name && <span><strong>Sản phẩm:</strong> {act.product_name}</span>}
                              {act.dosage && <span><strong>Liều lượng:</strong> {act.dosage}</span>}
                              {act.withdrawal_days !== null && act.withdrawal_days !== undefined && (
                                <span><strong>Cách ly:</strong> <span className={styles.activityWithdrawal}>{act.withdrawal_days} ngày</span></span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className={styles.noActivityText}>Không có chi tiết hoạt động.</p>
                    )}
                  </div>

                  {entry.status === 'PENDING_APPROVAL' && (
                    <div className={styles.actionFooter}>
                      <button 
                        onClick={() => { setViewEntryId(null); handleReject(entry.id); }} 
                        className={styles.rejectActionBtn}
                      >Từ chối</button>
                      <button 
                        onClick={() => { setViewEntryId(null); handleRequestChanges(entry.id); }} 
                        className={styles.requestChangeActionBtn}
                      >Yêu cầu sửa</button>
                      <button 
                        onClick={() => { setViewEntryId(null); handleApprove(entry.id); }} 
                        className={styles.approveActionBtn}
                      >Phê duyệt</button>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
