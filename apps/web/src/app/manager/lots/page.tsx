// SPDX-License-Identifier: MIT
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { QrCode, Info, Package } from 'lucide-react'
import { PageHeader, Pill, SegmentedFilter } from '@/components/ui'
import table from '@/components/features/dashboard/dashboard.module.css'
import kit from '@/components/features/dashboard/page-kit.module.css'
import { fetchJson } from '@/lib/api/fetch-json'
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
  const [chosenId, setChosenId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [lots, setLots] = useState<LotSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchJson<{ data?: LotSummary[] }>('/api/lots?visibility=published')
      .then(d => {
        setLots((d.data || []).map((l: LotSummary) => ({ ...l, status: (l.status || '').toLowerCase() })))
      })
      .catch(() => setError('Không thể tải danh sách lô hàng.'))
      .finally(() => setIsLoading(false))
  }, [])

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

  // The panel follows the chosen row, or the first lot on screen.
  const chosen = filteredLots.find(lot => lot.id === chosenId) ?? filteredLots[0]

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
    <div className={kit.page}>
      <PageHeader
        icon={<Package size={28} />}
        title="Lô hàng"
        description="Kiểm soát nghiệm thu, hồ sơ và mã QR trước khi xuất hàng"
      />

      {/* Manager chỉ xem + export QR — việc tạo lô hàng do Cán bộ kỹ thuật thực hiện (api-contract.md) */}
      <p className={kit.notice}>
        <Info size={16} aria-hidden="true" />
        <span>Cán bộ kỹ thuật tạo lô hàng. Trưởng HTX duyệt &amp; xuất QR.</span>
      </p>

      <SegmentedFilter
        label="Lọc theo trạng thái"
        value={activeTab}
        onChange={value => setActiveTab(value as FilterTab)}
        options={[
          { value: 'ALL', label: 'Tất cả', count: lots.length },
          { value: 'READY', label: 'Sẵn sàng', count: countReady },
          { value: 'QR_EXPORTED', label: 'Đã xuất QR', count: countQrExported },
        ]}
      />

      <div className={styles.columns}>
      <div className={`${kit.card} ${styles.list}`}>
        <div className={kit.toolbar}>
          <input
            type="search"
            className={kit.search}
            aria-label="Tìm lô hàng"
            placeholder="Tìm mã lô, sản phẩm..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className={kit.state}>Đang tải dữ liệu...</div>
        ) : error ? (
          <div className={kit.state}>{error}</div>
        ) : filteredLots.length === 0 ? (
          <div className={kit.state}>Không tìm thấy lô hàng nào.</div>
        ) : (
          <div className={table.tableWrap}>
            <table className={table.table}>
              <thead>
                <tr>
                  <th>Mã lô</th>
                  <th>Sản phẩm</th>
                  <th>Khối lượng</th>
                  <th>Ngày tạo</th>
                  <th>Trạng thái</th>
                  <th>QR</th>
                </tr>
              </thead>
              <tbody>
                {filteredLots.map(lot => (
                  <tr key={lot.id} className={`${kit.clickable}${chosen?.id === lot.id ? ` ${styles.chosen}` : ''}`} aria-selected={chosen?.id === lot.id} onClick={() => setChosenId(lot.id)}>
                    <td className={table.code}>
                      <Link href={`/manager/lots/${lot.id}`} className={table.action} onClick={e => e.stopPropagation()}>
                        {lot.lot_code || lot.id.substring(0, 8)}
                      </Link>
                    </td>
                    <td>{lot.commodity}</td>
                    <td>{lot.estimated_weight_kg ? `${lot.estimated_weight_kg.toLocaleString('vi-VN')} kg` : '—'}</td>
                    <td>{lot.created_at ? new Date(lot.created_at).toLocaleDateString('vi-VN') : '—'}</td>
                    <td>{renderStatus(lot.status)}</td>
                    <td><QrCode size={18} aria-hidden="true" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {chosen && (
        <aside className={`${kit.card} ${styles.panel}`} aria-label={`Lô ${chosen.lot_code}`}>
          <header>
            <h2>{chosen.lot_code}</h2>
            {renderStatus(chosen.status)}
          </header>
          <dl>
            <div><dt>Sản phẩm</dt><dd>{chosen.commodity}</dd></div>
            <div><dt>Khối lượng</dt><dd>{chosen.estimated_weight_kg ? `${chosen.estimated_weight_kg.toLocaleString('vi-VN')} kg` : '—'}</dd></div>
            <div><dt>Ngày tạo</dt><dd>{chosen.created_at ? new Date(chosen.created_at).toLocaleDateString('vi-VN') : '—'}</dd></div>
          </dl>
          <h3>Tiến trình lô</h3>
          <ol>
            <li data-done="true">Đóng lô</li>
            <li data-done="true">Nghiệm thu, sẵn sàng</li>
            <li data-done={chosen.status === 'qr_exported'}>Cấp mã QR truy xuất</li>
          </ol>
          <div className={styles.actions}>
            {chosen.status === 'qr_exported' && (
              <a className={kit.secondary} href={`/lot/${chosen.lot_code}`} target="_blank" rel="noopener noreferrer">
                <QrCode size={16} aria-hidden="true" /> Xem trang truy xuất
              </a>
            )}
            <Link className={kit.primary} href={`/manager/lots/${chosen.id}`}>Mở chi tiết lô</Link>
          </div>
        </aside>
      )}
      </div>
    </div>
  )
}
