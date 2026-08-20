// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { QrCode } from 'lucide-react'
import { Pill } from '@/components/ui'
import styles from './lots.module.css'

interface LotMock {
  id: string
  product: string
  volume: string
  status: 'DRAFT' | 'READY' | 'QR_EXPORTED'
}

const MOCK_LOTS: LotMock[] = [
  { id: 'LH-260813', product: 'Cải ngọt - 4 thửa', volume: '2.450 kg', status: 'READY' },
  { id: 'LH-260810', product: 'Xà lách - 3 thửa', volume: '1.820 kg', status: 'QR_EXPORTED' },
  { id: 'LH-260806', product: 'Dưa leo - 5 thửa', volume: '3.100 kg', status: 'DRAFT' }
]

type FilterTab = 'ALL' | 'READY' | 'QR_EXPORTED'

export default function ManagerLotsPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  const handleCreateCTA = () => {
    alert('Tính năng Tạo lô hàng thuộc thẩm quyền của Cán bộ Kỹ thuật. Giao diện này chỉ dùng để chuyển hướng sâu (deep-link).')
  }

  const handleRowClick = (lotId: string) => {
    router.push(`/manager/lots/${lotId}`)
  }

  // Lọc data theo tab và search
  const filteredLots = MOCK_LOTS.filter(lot => {
    const matchSearch = lot.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                        lot.product.toLowerCase().includes(searchQuery.toLowerCase())
    if (!matchSearch) return false

    if (activeTab === 'READY') return lot.status === 'READY'
    if (activeTab === 'QR_EXPORTED') return lot.status === 'QR_EXPORTED'
    return true
  })

  // Đếm số lượng cho các tab
  const countReady = MOCK_LOTS.filter(l => l.status === 'READY').length
  const countQrExported = MOCK_LOTS.filter(l => l.status === 'QR_EXPORTED').length

  const renderStatus = (status: LotMock['status']) => {
    switch (status) {
      case 'READY':
        return <Pill tone="green">Sẵn sàng</Pill>
      case 'QR_EXPORTED':
        return <Pill tone="blue">Đã xuất QR</Pill>
      case 'DRAFT':
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
        <button className={styles.createBtn} onClick={handleCreateCTA}>
          + Tạo lô hàng
        </button>
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
            Tất cả <span className={styles.filterCount}>{MOCK_LOTS.length}</span>
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
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Mã lô</th>
              <th>Sản phẩm & nguồn</th>
              <th>Sản lượng</th>
              <th>Trạng thái</th>
              <th style={{ width: '60px' }}></th>
            </tr>
          </thead>
          <tbody>
            {filteredLots.length > 0 ? (
              filteredLots.map(lot => (
                <tr key={lot.id} className={styles.tableRow} onClick={() => handleRowClick(lot.id)}>
                  <td style={{ fontWeight: 500 }}>{lot.id}</td>
                  <td>{lot.product}</td>
                  <td>{lot.volume}</td>
                  <td>{renderStatus(lot.status)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <QrCode size={20} className={styles.qrIcon} aria-label="QR Code Icon" />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                  Không tìm thấy lô hàng nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
