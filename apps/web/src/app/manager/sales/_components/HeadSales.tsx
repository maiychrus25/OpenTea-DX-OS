// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, Coins, Download, NotebookPen, Package, Pencil, Plus, Printer, Scale, ShoppingCart, Tag, Truck, UserRound } from 'lucide-react'
import { EmptyState, PageHeader, Pill } from '@/components/ui'
import { Pager, StatCards, Tabs, pageOf } from '@/components/features/manager-web/parts'
import { DetailPanel } from '@/components/features/manager-web/DetailPanel'
import ui from '@/components/features/manager-web/kit.module.css'
import kit from '@/components/features/dashboard/page-kit.module.css'
import table from '@/components/features/dashboard/dashboard.module.css'
import { localDay } from '@/domain/shared/local-day'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import { downloadCsv } from '@/lib/manager/download-csv'
import { formatVnd } from '@/lib/ledger/money'
import type { ReceivablesSummary, SalesOrderView } from '@/lib/sales/types'
import { dayMonthYear } from '@/lib/weighing/format'

type View = 'ALL' | 'OPEN' | 'SHIPPING' | 'DONE'

const MAX_PAGES = 20
const customer = (o: SalesOrderView) => o.partner_name ?? o.customer_name ?? 'Khách lẻ'
const products = (o: SalesOrderView) => o.lines.map((l) => l.lot_code).join(', ') || '—'
const grams = (o: SalesOrderView) => o.lines.reduce((sum, l) => sum + l.net_g, 0)
const kg = (g: number) => `${(g / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg`
const owing = (o: SalesOrderView) => o.status === 'CONFIRMED' && BigInt(o.outstanding_vnd) > BigInt(0)
const done = (o: SalesOrderView) => o.status === 'CONFIRMED' && !owing(o)

function state(o: SalesOrderView) {
  if (o.status === 'CANCELLED') return <Pill tone="red">Đã hủy</Pill>
  if (o.overdue) return <Pill tone="red">Quá hạn</Pill>
  return owing(o) ? <Pill tone="amber">Đang xử lý</Pill> : <Pill tone="green">Hoàn thành</Pill>
}

/** The month's sales orders with the chosen one beside the list. */
export function HeadSales({ initialOverdue }: { initialOverdue: boolean }) {
  const [orders, setOrders] = useState<SalesOrderView[] | null>(null)
  const [receivables, setReceivables] = useState<ReceivablesSummary | null>(null)
  const [failed, setFailed] = useState(false)
  const [view, setView] = useState<View>('ALL')
  const [search, setSearch] = useState('')
  // An overdue order may be from any month, so the overdue link opens on all of them.
  const [month, setMonth] = useState(() => (initialOverdue ? '' : localDay(new Date()).slice(0, 7)))
  const [overdue, setOverdue] = useState(initialOverdue)
  const [page, setPage] = useState(1)
  const [chosenId, setChosenId] = useState('')

  useEffect(() => {
    const read = async () => {
      const url = (cursor?: string) => `/api/sales/orders?${cursor ? new URLSearchParams({ cursor }) : ''}`
      let body = await fetchJson<{ data: SalesOrderView[]; next_cursor: string | null }>(url())
      let rows = body.data
      for (let i = 1; body.next_cursor && i < MAX_PAGES; i++) {
        body = await fetchJson<{ data: SalesOrderView[]; next_cursor: string | null }>(url(body.next_cursor))
        rows = [...rows, ...body.data]
      }
      setOrders(rows)
    }
    read().catch(() => setFailed(true))
    fetchJson<{ data: ReceivablesSummary }>('/api/sales/receivables')
      .then((body) => setReceivables(body.data))
      .catch(() => setReceivables(null))
  }, [])

  const inMonth = (orders ?? []).filter((o) => !month || o.ordered_on.startsWith(month))
  const confirmed = inMonth.filter((o) => o.status === 'CONFIRMED')
  const needle = search.trim().toLocaleLowerCase('vi')
  const listed = inMonth.filter((o) =>
    (view === 'ALL' || (view === 'OPEN' && owing(o)) || (view === 'DONE' && done(o))) &&
    (!overdue || o.overdue) &&
    (!needle || `${o.order_no} ${customer(o)}`.toLocaleLowerCase('vi').includes(needle)))
  const paged = pageOf(listed, page, 8)
  const chosen = listed.find((o) => o.id === chosenId) ?? paged.rows[0] ?? null
  const revenue = confirmed.reduce((sum, o) => sum + BigInt(o.total_vnd), BigInt(0)).toString()

  const exportRows = () => downloadCsv('don-hang.csv', [
    ['Mã đơn', 'Khách hàng', 'Sản phẩm', 'Số lượng (kg)', 'Thành tiền', 'Đã thu', 'Còn phải thu', 'Ngày đặt'],
    ...listed.map((o) => [o.order_no, customer(o), products(o), String(grams(o) / 1000), o.total_vnd, o.paid_vnd, o.outstanding_vnd, o.ordered_on]),
  ])

  return (
    <div className={kit.page}>
      <PageHeader
        icon={<ShoppingCart size={28} />}
        title="Bán hàng"
        description="Quản lý đơn hàng, doanh thu và tình trạng giao hàng."
        actions={
          <>
            <Link className={kit.primary} href="/manager/sales/new"><Plus size={16} aria-hidden="true" />Tạo đơn hàng</Link>
            <button type="button" className={kit.secondary} disabled={listed.length === 0} onClick={exportRows}><Download size={16} aria-hidden="true" />Xuất</button>
          </>
        }
      />

      <StatCards items={[
        { label: month ? 'Đơn hàng trong tháng' : 'Đơn hàng', value: `${inMonth.length} đơn`, icon: <ShoppingCart size={26} /> },
        { label: 'Tổng sản lượng', value: kg(confirmed.reduce((sum, o) => sum + grams(o), 0)), icon: <Package size={26} /> },
        { label: 'Doanh thu', value: `${formatVnd(revenue)} đ`, icon: <Coins size={26} />, note: receivables ? `Còn phải thu ${formatVnd(receivables.outstanding_vnd)} đ` : undefined },
        { label: 'Chờ giao hàng', value: '3 đơn', icon: <Truck size={26} />, sample: true },
      ]} />

      <div className={ui.bar}>
        <Tabs<View>
          label="Trạng thái"
          value={view}
          onChange={(key) => { setView(key); setPage(1) }}
          items={[
            { key: 'ALL', label: `Tất cả (${inMonth.length})` },
            { key: 'OPEN', label: `Đang xử lý (${inMonth.filter(owing).length})` },
            { key: 'SHIPPING', label: 'Đang giao (Mẫu)' },
            { key: 'DONE', label: `Hoàn thành (${inMonth.filter(done).length})` },
          ]}
        />
        <input type="search" className={`${ui.control} ${ui.grow}`} aria-label="Tìm đơn" placeholder="Tìm mã đơn, khách hàng..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
        <button type="button" className={`${ui.small} ${overdue ? ui.solid : ''}`} aria-pressed={overdue} onClick={() => { setOverdue(!overdue); setPage(1) }}>Quá hạn</button>
        <input type="month" className={ui.control} aria-label="Tháng" value={month} onChange={(e) => { setMonth(e.target.value); setPage(1) }} />
      </div>

      <div className={chosen ? ui.split : undefined}>
        <section className={kit.card} aria-label="Danh sách đơn hàng">
          {failed ? <div className={kit.state}>{LOAD_FAILED_MESSAGE}</div> : !orders ? <div className={kit.state}>Đang tải đơn bán...</div> : listed.length === 0 ? (
            <EmptyState icon={<ShoppingCart />} title={view === 'SHIPPING' ? 'Đơn hàng chưa có bước giao hàng.' : 'Chưa có đơn bán nào với bộ lọc này.'} />
          ) : (
            <>
              <div className={table.tableWrap}>
                <table className={table.table}>
                  <thead><tr><th>#</th><th>Mã đơn hàng</th><th>Khách hàng</th><th>Sản phẩm</th><th className={ui.num}>Số lượng</th><th className={ui.num}>Thành tiền (đ)</th><th>Trạng thái</th></tr></thead>
                  <tbody className={ui.rows}>
                    {paged.rows.map((o, index) => (
                      <tr key={o.id} aria-selected={o.id === chosen?.id} onClick={() => setChosenId(o.id)}>
                        <td>{paged.start + index + 1}</td>
                        <td><button type="button" className={ui.link} onClick={() => setChosenId(o.id)}>{o.order_no}</button></td>
                        <td>{customer(o)}</td>
                        <td>{products(o)}</td>
                        <td className={ui.num}>{kg(grams(o))}</td>
                        <td className={ui.num}><strong>{formatVnd(o.total_vnd)}</strong></td>
                        <td>{state(o)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager current={paged.current} pages={paged.pages} start={paged.start} shown={paged.rows.length} total={listed.length} unit="đơn hàng" onPage={setPage} />
            </>
          )}
        </section>

        {chosen && (
          <DetailPanel
            title={`Đơn hàng ${chosen.order_no}`}
            status={state(chosen)}
            rows={[
              { icon: <UserRound size={15} />, label: 'Khách hàng', value: customer(chosen) },
              { icon: <Package size={15} />, label: 'Sản phẩm', value: products(chosen) },
              { icon: <Scale size={15} />, label: 'Số lượng', value: kg(grams(chosen)) },
              { icon: <Tag size={15} />, label: 'Đơn giá', value: chosen.lines[0]?.price_vnd_per_kg ? `${chosen.lines[0].price_vnd_per_kg.toLocaleString('vi-VN')} đ/kg` : '—' },
              { icon: <CalendarDays size={15} />, label: 'Ngày đặt', value: dayMonthYear(chosen.ordered_on) },
              { icon: <CalendarDays size={15} />, label: 'Hạn thu tiền', value: chosen.due_on ? dayMonthYear(chosen.due_on) : '—' },
              { icon: <Coins size={15} />, label: 'Còn phải thu', value: `${formatVnd(chosen.outstanding_vnd)} đ` },
              { icon: <NotebookPen size={15} />, label: 'Ghi chú', value: chosen.note || '—' },
            ]}
            totalLabel="Thành tiền"
            total={`${formatVnd(chosen.total_vnd)} đ`}
          >
            <button type="button" className={ui.small} onClick={() => window.print()}><Printer size={14} aria-hidden="true" />In đơn hàng</button>
            <Link className={`${ui.small} ${ui.solid}`} href={`/manager/sales/${chosen.id}`}><Pencil size={14} aria-hidden="true" />Thu tiền / sửa</Link>
          </DetailPanel>
        )}
      </div>
    </div>
  )
}
