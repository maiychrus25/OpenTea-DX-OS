// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { Landmark } from 'lucide-react'
import { FilteredTable } from '@/components/features/officer-web/FilteredTable'
import { Header, Stats } from '@/components/features/officer-web/parts'
import { REVENUE, money, sum } from '@/components/features/officer-web/sample'
import styles from '@/components/features/officer-web/kit.module.css'

export const metadata = { title: 'Doanh thu' }

const DAYS = ['22/11', '23/11', '24/11', '25/11', '26/11', '27/11']

/** Sample content: there is no payment service yet. */
export default function OfficerPaymentsPage() {
  const total = sum(REVENUE, (r) => r.total)
  const of = (source: string) => sum(REVENUE.filter((r) => r.source === source), (r) => r.total)
  const days = DAYS.map((day) => {
    const rows = REVENUE.filter((r) => r.date.startsWith(day))
    return { day, total: sum(rows, (r) => r.total), rows }
  })
  const highest = Math.max(...days.map((d) => d.total))
  const share = (value: number) => `${((value / total) * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`

  return (
    <div className={styles.page}>
      <Header icon={<Landmark size={24} />} title="Doanh thu" description="Tổng hợp doanh thu từ gian hàng sản phẩm và tour của HTX." />
      <Stats items={[
        { label: 'Tổng doanh thu', value: money(total) },
        { label: `Gian hàng · ${share(of('Gian hàng'))}`, value: money(of('Gian hàng')) },
        { label: `Tour · ${share(of('Tour'))}`, value: money(of('Tour')) },
      ]} />
      <section className={styles.pn} style={{ flex: 'none' }}>
        <h2 className={styles.ph}>Doanh thu theo ngày (nghìn đồng)</h2>
        <ol className={styles.chart}>
          {days.map((d) => (
            <li key={d.day} title={`${d.day}: ${money(d.total)}`}>
              {d.total > 0 && <span className={styles.value}>{(d.total / 1000).toLocaleString('vi-VN')}</span>}
              {d.rows.map((r) => (
                <span key={r.code} className={`${styles.bar} ${r.source === 'Tour' ? styles.tour : styles.shop}`} style={{ height: `${(r.total / highest) * 120}px` }} />
              ))}
              <span className={styles.day}>{d.day}</span>
            </li>
          ))}
        </ol>
        <div className={styles.legend}>
          <span><i className={styles.tour} />Tour</span>
          <span><i className={styles.shop} />Gian hàng</span>
        </div>
      </section>
      <FilteredTable
        filters={['Gian hàng', 'Tour']}
        columns={['Ngày', 'Nguồn', 'Mã', 'Doanh thu']}
        numeric={[3]}
        rows={REVENUE.map((r) => ({
          key: r.code,
          group: r.source,
          cells: [r.date, r.source, <span key="code" className={styles.mono}>{r.code}</span>, money(r.total)],
        }))}
      />
    </div>
  )
}
