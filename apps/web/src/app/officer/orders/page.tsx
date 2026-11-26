// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import Link from 'next/link'
import { Package } from 'lucide-react'
import { FilteredTable } from '@/components/features/officer-web/FilteredTable'
import { Header, Stats } from '@/components/features/officer-web/parts'
import { ORDERS, ORDER_STATUS, money } from '@/components/features/officer-web/sample'
import styles from '@/components/features/officer-web/kit.module.css'

export const metadata = { title: 'Đơn hàng' }

/** Sample content: there is no order service yet. Only DH-0142 has a detail page. */
export default function OfficerOrdersPage() {
  const count = (status: string) => ORDERS.filter((o) => o.status === status).length
  const statuses = Object.keys(ORDER_STATUS)

  return (
    <div className={styles.page}>
      <Header icon={<Package size={24} />} title="Đơn hàng" description={`${count('Chờ xác nhận')} đơn chờ xác nhận`} />
      <Stats items={statuses.map((status) => ({ label: status, value: count(status), icon: <Package /> }))} />
      <FilteredTable
        filters={statuses}
        columns={['Mã đơn', 'Người nhận', 'Điện thoại', 'Tổng tiền', 'Trạng thái', 'Thao tác']}
        numeric={[3]}
        rows={ORDERS.map((o) => ({
          key: o.code,
          group: o.status,
          cells: [
            <span key="code" className={styles.mono}>{o.code}</span>,
            o.name,
            o.phone,
            money(o.total),
            <span key="status" className={`${styles.tag} ${styles[ORDER_STATUS[o.status]]}`}>{o.status}</span>,
            o.code === 'DH-0142'
              ? <Link key="open" href="/officer/orders/DH-0142" className={styles.link}>Chi tiết</Link>
              : <span key="open" className={styles.muted}>—</span>,
          ],
        }))}
      />
    </div>
  )
}
