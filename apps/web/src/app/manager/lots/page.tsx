// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { QrCode, Info } from 'lucide-react'
import { Pill } from '@/components/ui'
import styles from './lots.module.css'

interface LotSummary {
  id: string
  lot_code: string
  commodity: string
  status: string
  estimated_weight_kg?: number
  created_at: string
}

type FilterTab = 'ALL' | 'READY' | 'QR_EXPORTED'

export default function ManagerLotsPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [lots, setLots] = useState<LotSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/lots?visibility=published')
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(d => {
        setLots((d.data || []).map((l: LotSummary) => ({ ...l, status: (l.status || '').toLowerCase() })))
      })
      .catch(() => setError('Không thể tải danh sách lô hàng.'))
      .finally(() => setIsLoading(false))
  }, [])

  const handleRowClick = (lotId: string) => {
    router.push(`/manager/lots/${lotId}`)
  }

  // Lọc data theo tab và search
  const filteredLots = lots.filter(lot => {
    const matchSearch = lot.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                        (lot.lot_code && lot.lot_code.toLowerCase().includes(searchQuery.toLowerCase())) ||
                        (lot.commodity && lot.commodity.toLowerCase().includes(searchQuery.toLowerCase()))
    if (!matchSearch) return false

    if (activeTab === 'READY') return lot.status === 'ready'
    if (activeTab === 'QR_EXPORTED') return lot.status === 'qr_exported'
    return true
  })

  // Đếm số lượng cho các tab
  const countReady = lots.filter(l => l.status === 'ready').length
  const countQrExported = lots.filter(l => l.status === 'qr_exported').length

  const renderStatus = (status: string) => {
    switch (status) {
      case 'ready':
        return <Pill tone="green">Sẵn sàng</Pill>
      case 'qr_exported':
        return <Pill tone="blue">Đã xuất QR</Pill>
      case 'draft':
      default:
        return <Pill tone="amber">Nháp</Pill>
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>LÔ HÀNG & TRUY XUẤT</span>
          <h1 className={styles.title}>Sẵn sàng giao thương</h1>
          <p className={styles.subtitle}>Kiểm soát nghiệm thu, hồ sơ và mã QR trước khi xuất hàng.</p>
        </div>
        {/* Manager chỉ xem + export QR — việc tạo lô hàng do Cán bộ kỹ thuật thực hiện (api-contract.md) */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          background: '#f0fdf4', border: '1px solid #bbf7d0',
          borderRadius: '0.5rem', padding: '0.5rem 1rem',
          fontSize: '0.85rem', color: '#166534',
        }}>
          <Info className="w-4 h-4 shrink-0 text-emerald-700" aria-hidden="true" />
          <span>Cán bộ kỹ thuật tạo lô hàng. Trưởng HTX duyệt & xuất QR.</span>
        </div>
      </div>

      <div className={styles.filterRow}>
        <input 
          type="text" 
          className={styles.searchbox} 
          placeholder="Tìm mã lô, sản phẩm..." 
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        
        <div className={styles.filterTabs}>
          <button 
            className={`${styles.filter} ${activeTab === 'ALL' ? styles.filterActive : ''}`}
            onClick={() => setActiveTab('ALL')}
          >
            Tất cả <span className={styles.filterCount}>{lots.length}</span>
          </button>
          <button 
            className={`${styles.filter} ${activeTab === 'READY' ? styles.filterActive : ''}`}
            onClick={() => setActiveTab('READY')}
          >
            Sẵn sàng <span className={styles.filterCount}>{countReady}</span>
          </button>
          <button 
            className={`${styles.filter} ${activeTab === 'QR_EXPORTED' ? styles.filterActive : ''}`}
            onClick={() => setActiveTab('QR_EXPORTED')}
          >
            Đã xuất QR <span className={styles.filterCount}>{countQrExported}</span>
          </button>
        </div>
      </div>

      <div className={styles.tableContainer}>
        {isLoading ? (
          <div className={styles.loadingCell}>
            Đang tải dữ liệu...
          </div>
        ) : error ? (
          <div className={styles.emptyCell}>
            {error}
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Mã lô</th>
                <th>Sản phẩm & nguồn</th>
                <th>Sản lượng</th>
                <th>Trạng thái</th>
                <th className={styles.actionCol}></th>
              </tr>
            </thead>
            <tbody>
              {filteredLots.length > 0 ? (
                filteredLots.map(lot => (
                  <tr key={lot.id} className={styles.tableRow} onClick={() => handleRowClick(lot.id)}>
                    <td className={styles.lotCode}>{lot.lot_code || lot.id.substring(0,8)}</td>
                    <td>{lot.commodity}</td>
                    <td>{lot.estimated_weight_kg ? `${lot.estimated_weight_kg} kg` : '-'}</td>
                    <td>{renderStatus(lot.status)}</td>
                    <td className={styles.actionCell}>
                      <QrCode size={20} className={styles.qrIcon} aria-label="QR Code Icon" />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className={styles.emptyCell}>
                    Không tìm thấy lô hàng nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
