// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { Pill } from '@/components/ui'
import { LotCreateForm } from './LotCreateForm'
import styles from '../lots.module.css'

interface LotSummary {
  id: string
  lot_code: string
  commodity: string
  packaging_date: string | null
  total_weight_kg: number | null
  status: string
  parcel_count: number
  created_at: string
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Bản nháp',
  ready: 'Sẵn sàng',
  qr_exported: 'Đã xuất QR',
}

function statusTone(status: string): 'amber' | 'green' | 'neutral' {
  switch (status) {
    case 'draft': return 'neutral'
    case 'ready': return 'amber'
    case 'qr_exported': return 'green'
    default: return 'neutral'
  }
}

export function LotList() {
  const [lots, setLots] = useState<LotSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [exporting, setExporting] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState('')

  const fetchLots = useCallback(() => {
    setLoading(true)
    fetch('/api/lots')
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(j => setLots((j.data || []).map((l: any) => ({ ...l, status: (l.status || '').toLowerCase() }))))
      .catch(() => setLots([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchLots() }, [fetchLots])

  function handleCreated() {
    setShowForm(false)
    fetchLots()
  }

  async function handleExportQr(lotId: string) {
    setExporting(lotId)
    setSuccessMsg('')
    try {
      const res = await fetch(`/api/lots/${lotId}/export-qr`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error?.message || 'Lỗi xuất QR')
      }
      const data = await res.json()
      setSuccessMsg(`Đã xuất QR thành công! Mã: ${data.data.lot_code}`)
      fetchLots()
    } catch (err: unknown) {
      setSuccessMsg(err instanceof Error ? err.message : 'Lỗi')
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Quản lý Lô hàng</h1>
        <button className={styles.createBtn} onClick={() => setShowForm(true)}>+ Tạo lô mới</button>
      </div>

      {successMsg && <div className={styles.successBanner}>{successMsg}</div>}

      {loading ? (
        <div className={styles.empty}>Đang tải...</div>
      ) : lots.length === 0 ? (
        <div className={styles.empty}>Chưa có lô hàng nào.</div>
      ) : (
        <div className={styles.grid}>
          {lots.map(lot => (
            <div key={lot.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.lotCode}>{lot.lot_code}</span>
                <Pill tone={statusTone(lot.status)}>
                  {STATUS_LABELS[lot.status] ?? lot.status}
                </Pill>
              </div>
              <div className={styles.cardBody}>
                <span>Nông sản: {lot.commodity}</span>
                <span>Số thửa: {lot.parcel_count}</span>
                {lot.total_weight_kg && <span>Khối lượng: {lot.total_weight_kg} kg</span>}
                <span>Ngày tạo: {new Date(lot.created_at).toLocaleDateString('vi-VN')}</span>
              </div>
              <div className={styles.cardActions}>
                {lot.status !== 'qr_exported' && (
                  <button
                    className={styles.qrBtn}
                    onClick={() => handleExportQr(lot.id)}
                    disabled={exporting === lot.id}
                  >
                    {exporting === lot.id ? 'Đang xuất...' : '📱 Xuất QR'}
                  </button>
                )}
                {lot.status === 'qr_exported' && (
                  <a href={`/lot/${lot.lot_code}`} target="_blank" rel="noopener noreferrer" className={styles.viewBtn}>
                    Xem trang QR
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className={styles.overlay} onClick={() => setShowForm(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <LotCreateForm onSuccess={handleCreated} onCancel={() => setShowForm(false)} />
          </div>
        </div>
      )}
    </div>
  )
}
