// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, Download, Eye, Layers, NotebookPen, Package, Plus, QrCode, Sprout, Truck, UserRound, XCircle } from 'lucide-react'
import { EmptyState, PageHeader, Pill } from '@/components/ui'
import { Pager, Sample, StatCards, Tabs, pageOf } from '@/components/features/manager-web/parts'
import { DetailPanel } from '@/components/features/manager-web/DetailPanel'
import { Steps } from '@/components/features/manager-web/Steps'
import ui from '@/components/features/manager-web/kit.module.css'
import table from '@/components/features/dashboard/dashboard.module.css'
import kit from '@/components/features/dashboard/page-kit.module.css'
import { fetchJson } from '@/lib/api/fetch-json'
import { downloadCsv } from '@/lib/manager/download-csv'

interface LotSummary {
  id: string
  lot_code: string
  commodity: string
  status: string
  estimated_weight_kg?: number
  created_at: string
}

type View = 'ALL' | 'MAKING' | 'SHIPPED' | 'CANCELLED'

const day = (value?: string) => (value ? new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—')
const weight = (lot: LotSummary) => (lot.estimated_weight_kg ? lot.estimated_weight_kg.toLocaleString('vi-VN') : '—')
const shipped = (lot: LotSummary) => lot.status === 'qr_exported'

const pill = (lot: LotSummary) => (shipped(lot) ? <Pill tone="green">Đã xuất hàng</Pill> : <Pill tone="blue">{lot.status === 'ready' ? 'Sẵn sàng' : 'Đang sản xuất'}</Pill>)

export default function ManagerLotsPage() {
  const [lots, setLots] = useState<LotSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('ALL')
  const [search, setSearch] = useState('')
  const [month, setMonth] = useState('')
  const [page, setPage] = useState(1)
  const [chosenId, setChosenId] = useState('')

  useEffect(() => {
    fetchJson<{ data?: LotSummary[] }>('/api/lots?visibility=published')
      .then((d) => setLots((d.data || []).map((l) => ({ ...l, status: (l.status || '').toLowerCase() }))))
      .catch(() => setError('Không thể tải danh sách lô hàng.'))
      .finally(() => setIsLoading(false))
  }, [])

  const needle = search.trim().toLocaleLowerCase('vi')
  const inMonth = lots.filter((l) => !month || l.created_at?.startsWith(month))
  const listed = inMonth.filter((l) =>
    (view === 'ALL' || (view === 'MAKING' && !shipped(l)) || (view === 'SHIPPED' && shipped(l))) &&
    (!needle || `${l.lot_code} ${l.commodity}`.toLocaleLowerCase('vi').includes(needle)))
  const paged = pageOf(listed, page, 8)
  const chosen = listed.find((l) => l.id === chosenId) ?? paged.rows[0] ?? null
  const done = inMonth.filter(shipped).length

  return (
    <div className={kit.page}>
      <PageHeader
        icon={<Package size={28} />}
        title="Lô hàng"
        description="Quản lý lô hàng sản xuất, đóng gói và xuất bán."
        actions={
          <>
            <Link href="/manager/lots/from-batches" className={kit.primary}><Plus size={16} aria-hidden="true" />Tạo lô hàng</Link>
            <button type="button" className={kit.secondary} disabled={listed.length === 0} onClick={() => downloadCsv('lo-hang.csv', [['Mã lô', 'Sản phẩm', 'Khối lượng (kg)', 'Ngày tạo', 'Trạng thái'], ...listed.map((l) => [l.lot_code, l.commodity, String(l.estimated_weight_kg ?? ''), day(l.created_at), shipped(l) ? 'Đã xuất hàng' : 'Đang sản xuất'])])}><Download size={16} aria-hidden="true" />Xuất</button>
          </>
        }
      />
      <StatCards items={[
        { label: 'Tổng lô hàng', value: String(inMonth.length), icon: <Layers size={26} /> },
        { label: 'Đang sản xuất', value: String(inMonth.length - done), icon: <Package size={26} /> },
        { label: 'Đã xuất hàng', value: String(done), icon: <Truck size={26} /> },
        { label: 'Hủy', value: '1', icon: <XCircle size={26} />, tone: 'red', sample: true },
      ]} />
      <div className={ui.bar}>
        <Tabs<View> label="Trạng thái" value={view} onChange={(key) => { setView(key); setPage(1) }} items={[{ key: 'ALL', label: `Tất cả (${inMonth.length})` }, { key: 'MAKING', label: `Đang sản xuất (${inMonth.length - done})` }, { key: 'SHIPPED', label: `Đã xuất hàng (${done})` }, { key: 'CANCELLED', label: 'Đã hủy (Mẫu)' }]} />
        <input type="search" className={`${ui.control} ${ui.grow}`} aria-label="Tìm lô hàng" placeholder="Tìm mã lô, sản phẩm..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
        <input type="month" className={ui.control} aria-label="Tháng" value={month} onChange={(e) => { setMonth(e.target.value); setPage(1) }} />
      </div>
      <div className={chosen ? ui.split : undefined}>
        <section className={kit.card} aria-label="Danh sách lô hàng">
          {isLoading ? <div className={kit.state}>Đang tải dữ liệu...</div> : error ? <div className={kit.state}>{error}</div> : listed.length === 0 ? <EmptyState icon={<Package />} title="Không tìm thấy lô hàng nào." /> : (
            <>
              <div className={table.tableWrap}>
                <table className={table.table}>
                  <thead><tr><th>#</th><th>Mã lô hàng</th><th>Sản phẩm</th><th className={ui.num}>Khối lượng (kg)</th><th>Ngày tạo</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
                  <tbody className={ui.rows}>
                    {paged.rows.map((lot, index) => (
                      <tr key={lot.id} aria-selected={lot.id === chosen?.id} onClick={() => setChosenId(lot.id)}>
                        <td>{paged.start + index + 1}</td>
                        <td><Link href={`/manager/lots/${lot.id}`} className={table.action} onClick={(e) => e.stopPropagation()}>{lot.lot_code || lot.id.substring(0, 8)}</Link></td>
                        <td>{lot.commodity}</td>
                        <td className={ui.num}>{weight(lot)}</td>
                        <td>{day(lot.created_at)}</td>
                        <td>{pill(lot)}</td>
                        <td><button type="button" className={ui.small} aria-label={`Xem ${lot.lot_code}`} onClick={() => setChosenId(lot.id)}><Eye size={14} aria-hidden="true" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager current={paged.current} pages={paged.pages} start={paged.start} shown={paged.rows.length} total={listed.length} unit="lô hàng" onPage={setPage} />
            </>
          )}
        </section>
        {chosen && (
          <DetailPanel
            title={`Lô ${chosen.lot_code}`}
            status={pill(chosen)}
            rows={[
              { icon: <Sprout size={15} />, label: 'Sản phẩm', value: chosen.commodity },
              { icon: <Layers size={15} />, label: 'Khối lượng', value: `${weight(chosen)} kg` },
              { icon: <CalendarDays size={15} />, label: 'Ngày tạo', value: day(chosen.created_at) },
              { icon: <UserRound size={15} />, label: 'Người tạo', value: <>— <Sample /></> },
              { icon: <NotebookPen size={15} />, label: 'Ghi chú', value: '—' },
            ]}
            extra={<Steps title="Quy trình lô hàng" steps={[
              { label: 'Đóng lô', when: day(chosen.created_at), done: true },
              { label: 'Nghiệm thu', when: chosen.status === 'draft' ? 'Chưa thực hiện' : 'Đã xong', done: chosen.status !== 'draft' },
              { label: 'Cấp mã QR truy xuất', when: shipped(chosen) ? 'Đã xong' : 'Chưa thực hiện', done: shipped(chosen) },
            ]} />}
          >
            {shipped(chosen) && <a className={ui.small} href={`/lot/${chosen.lot_code}`} target="_blank" rel="noopener noreferrer"><QrCode size={14} aria-hidden="true" />Trang truy xuất</a>}
            <Link className={`${ui.small} ${ui.solid}`} href={`/manager/lots/${chosen.id}`}>Mở chi tiết lô</Link>
          </DetailPanel>
        )}
      </div>
    </div>
  )
}
