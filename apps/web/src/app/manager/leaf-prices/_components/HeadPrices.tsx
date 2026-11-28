// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, Leaf, Pencil, Plus, Sprout, Tag } from 'lucide-react'
import { EmptyState, PageHeader } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { LeafPricesPanel } from '@/components/features/weighing/LeafPricesPanel'
import { StatCards } from '@/components/features/manager-web/parts'
import ui from '@/components/features/manager-web/kit.module.css'
import kit from '@/components/features/dashboard/page-kit.module.css'
import table from '@/components/features/dashboard/dashboard.module.css'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import styles from './prices.module.css'

interface PriceRow { grade_id: string; grade_name: string; price_vnd_per_kg: number | null; yesterday_vnd_per_kg: number | null }
interface Today { date: string; published_at: string | null; prices: PriceRow[] }
export interface PriceChange { id: string; grade_name: string; price_date: string; price_vnd_per_kg: number; mine: boolean }

const money = (value: number) => value.toLocaleString('vi-VN')
const date = (value: string) => new Date(value).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' })

/** Today's price of each grade, the table behind it and what was published before. */
export function HeadPrices({ history }: { history: PriceChange[] }) {
  const router = useRouter()
  const [today, setToday] = useState<Today | null>(null)
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState(false)

  const load = useCallback(() => {
    fetchJson<{ data: Today }>('/api/leaf-prices/today')
      .then((body) => { setToday(body.data); setFailed(false) })
      .catch(() => setFailed(true))
  }, [])
  useEffect(() => { load() }, [load])

  const close = () => { setEditing(false); load(); router.refresh() }
  const rows = today?.prices ?? []
  const icons = [<Leaf key="a" size={26} />, <Sprout key="b" size={26} />, <Sprout key="c" size={26} />]
  const mine = (gradeName: string) => history.find((change) => change.grade_name === gradeName)

  return (
    <div className={kit.page}>
      <PageHeader
        icon={<Tag size={28} />}
        title="Giá thu mua"
        description="Theo dõi giá thu mua búp chè theo từng loại."
        actions={<button type="button" className={kit.primary} onClick={() => setEditing(true)}><Plus size={16} aria-hidden="true" />Cập nhật giá</button>}
      />

      <StatCards items={rows.slice(0, 4).map((row, index) => ({
        label: row.grade_name,
        value: row.price_vnd_per_kg === null ? '— đ/kg' : `${money(row.price_vnd_per_kg)} đ/kg`,
        icon: icons[index % icons.length],
      }))} />

      <div className={styles.columns}>
        <section className={kit.card} aria-labelledby="current-prices">
          <h2 id="current-prices" className={styles.title}>Bảng giá hiện hành</h2>
          {failed ? <div className={kit.state}>{LOAD_FAILED_MESSAGE}</div> : !today ? <div className={kit.state}>Đang tải...</div> : (
            <div className={table.tableWrap}>
              <table className={table.table}>
                <thead><tr><th>Loại búp</th><th>Đơn giá</th><th>Ngày áp dụng</th><th>Người cập nhật</th><th>Thao tác</th></tr></thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.grade_id}>
                      <td><strong>{row.grade_name}</strong></td>
                      <td>{row.price_vnd_per_kg === null ? '—' : `${money(row.price_vnd_per_kg)} đ/kg`}</td>
                      <td>{row.price_vnd_per_kg === null ? '—' : date(today.date)}</td>
                      <td>{row.price_vnd_per_kg !== null && mine(row.grade_name)?.mine ? 'Bạn' : '—'}</td>
                      <td><button type="button" className={ui.small} aria-label={`Sửa giá ${row.grade_name}`} onClick={() => setEditing(true)}><Pencil size={14} aria-hidden="true" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={kit.card} aria-labelledby="price-history">
          <h2 id="price-history" className={styles.title}>Lịch sử điều chỉnh giá</h2>
          {history.length === 0 ? <EmptyState icon={<Clock size={28} />} title="Chưa có lịch sử điều chỉnh." /> : (
            <ul className={styles.history}>
              {history.map((change) => (
                <li key={change.id}>
                  <span>{date(change.price_date)}</span>
                  <strong>{change.grade_name}</strong>
                  <span>{money(change.price_vnd_per_kg)} đ/kg</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Modal isOpen={editing} onClose={close} title="Cập nhật giá thu mua" size="lg">
        <LeafPricesPanel />
      </Modal>
    </div>
  )
}
