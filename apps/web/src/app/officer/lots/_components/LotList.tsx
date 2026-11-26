// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import { PageHeader } from '@/components/ui/PageHeader'
import { Package, CheckCircle, Layers, Weight, CalendarDays, ArrowRight } from 'lucide-react'
import { Stats } from '@/components/features/officer-web/parts'
import React, { useEffect, useState, useCallback } from 'react'
import { Pill } from '@/components/ui'
import { QrCode } from 'lucide-react'
import { LotCreateForm } from './LotCreateForm'
import styles from '../lots.module.css'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import { withoutErrorCode } from '@/lib/api/error-message'

interface LotSummary {
  id: string
  lot_code: string
  commodity: string
  harvest_date: string | null
  estimated_weight_kg: number | null
  actual_weight_kg: number | null
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
  const [loadFailed, setLoadFailed] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [exporting, setExporting] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState('')

  const fetchLots = useCallback(() => {
    setLoading(true)
    fetchJson<{ data?: LotSummary[] }>('/api/lots')
      .then(j => { setLots((j.data || []).map((l: any) => ({ ...l, status: (l.status || '').toLowerCase() }))); setLoadFailed(false) })
      .catch(() => { setLots([]); setLoadFailed(true) })
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
        throw new Error(withoutErrorCode(err?.error?.message || 'Lỗi xuất QR'))
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
      <PageHeader
        icon={<Package size={28} />}
        title="Quản lý Lô hàng"
        description="Tạo lô từ thửa đã thu hoạch và xuất mã QR truy xuất"
        actions={<button type="button" className={styles.createBtn} onClick={() => setShowForm(true)}>+ Tạo lô mới</button>}
      />

      {!loading && !loadFailed && <Stats items={[
        { label: 'Tổng số lô', value: lots.length, icon: <Package /> },
        { label: 'Lô sẵn sàng', value: lots.filter(lot => lot.status === 'ready').length, icon: <CheckCircle /> },
        { label: 'Lô đã xuất QR', value: lots.filter(lot => lot.status === 'qr_exported').length, icon: <QrCode /> },
      ]} />}

      {successMsg && <div className={styles.successBanner}>{successMsg}</div>}

      {loading ? (
        <div className={styles.empty}>Đang tải...</div>
      ) : loadFailed ? (
        <div className={styles.empty}>{LOAD_FAILED_MESSAGE}</div>
      ) : lots.length === 0 ? (
        <div className={styles.empty}>Chưa có lô hàng nào.</div>
      ) : (
        <div className={styles.grid}>
          {lots.map(lot => (
            <div key={lot.id} className={styles.card}>
              <div className={styles.cardHead}>
                <span className={styles.mark} aria-hidden="true"><Package size={22} /></span>
                <div className={styles.headText}>
                  <span className={styles.lotCode}>{lot.lot_code}</span>
                  <span className={styles.commodity}>{lot.commodity}</span>
                </div>
                <Pill tone={statusTone(lot.status)}>
                  {STATUS_LABELS[lot.status] ?? lot.status}
                </Pill>
              </div>
              <dl className={styles.facts}>
                <div><dt><Layers size={18} aria-hidden="true" />Số thửa</dt><dd>{lot.parcel_count}</dd></div>
                {lot.estimated_weight_kg ? <div><dt><Weight size={18} aria-hidden="true" />Khối lượng</dt><dd>{lot.estimated_weight_kg.toLocaleString('vi-VN')} kg</dd></div> : null}
                <div><dt><CalendarDays size={18} aria-hidden="true" />Ngày tạo</dt><dd>{new Date(lot.created_at).toLocaleDateString('vi-VN')}</dd></div>
              </dl>
              <div className={styles.cardActions}>
                {lot.status !== 'qr_exported' && (
                  <button
                    className={styles.qrBtn}
                    onClick={() => handleExportQr(lot.id)}
                    disabled={exporting === lot.id}
                  >
                    {exporting === lot.id ? 'Đang xuất...' : (
                      <>
                        <QrCode size={15} aria-hidden="true" />
                        Xuất QR
                      </>
                    )}
                  </button>
                )}
                {lot.status === 'qr_exported' && (
                  <a href={`/lot/${lot.lot_code}`} target="_blank" rel="noopener noreferrer" className={styles.viewBtn}>
                    Xem trang QR <ArrowRight size={18} aria-hidden="true" />
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
