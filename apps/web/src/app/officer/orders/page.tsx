// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/* eslint-disable @next/next/no-img-element -- small drawings shipped with the page */

import React from 'react'
import Link from 'next/link'
import { Boxes, Package, Users, Wallet } from 'lucide-react'
import { FilteredTable } from '@/components/features/officer-web/FilteredTable'
import { Header } from '@/components/features/officer-web/parts'
import { ORDERS, money, orderLines, orderTotal, sum } from '@/components/features/officer-web/sample'
import styles from '@/components/features/officer-web/kit.module.css'

export const metadata = { title: 'Đơn hàng' }

/** Sample content: there is no order service yet. */
export default function OfficerOrdersPage() {
  const placed = ORDERS.filter((o) => o.status === 'Đã đặt')
  const quantity = (o: (typeof ORDERS)[number]) => sum(o.items, (i) => i.quantity)

  return (
    <div className={styles.page}>
      <Header icon={<Package size={24} />} title="Đơn hàng" description="Hàng có sẵn nên khách đặt là xong, không cần HTX duyệt." />
      <FilteredTable
        figures={[
          { label: 'Người đặt', value: placed.length, icon: <Users />, filter: 'Đã đặt' },
          { label: 'Sản phẩm đã đặt', value: sum(placed, quantity), icon: <Boxes />, filter: 'Đã đặt', sort: 'quantity' },
          { label: 'Giá trị đặt', value: money(sum(placed, orderTotal)), icon: <Wallet />, filter: 'Đã đặt', sort: 'total' },
        ]}
        filters={['Đã đặt', 'Đã huỷ']}
        columns={['Mã đơn', 'Người đặt', 'Sản phẩm đã mua', 'Tổng tiền', 'Trạng thái', 'Thao tác']}
        numeric={[3]}
        rows={ORDERS.map((o) => ({
          key: o.code,
          group: o.status,
          rank: { quantity: quantity(o), total: orderTotal(o) },
          cells: [
            <span key="code" className={styles.mono}>{o.code}</span>,
            <span key="buyer">
              <strong>{o.name}</strong>
              <br />
              <span className={styles.muted}>{o.phone}</span>
            </span>,
            <ul key="lines" className={styles.lines}>
              {orderLines(o).map(({ product, quantity: count }) => (
                <li key={product.name}>
                  <img src={`/images/officer/${product.image}.svg`} alt="" />
                  <span>
                    <strong>{product.name}</strong>
                    <span className={styles.muted}>{product.pack} × {count}</span>
                  </span>
                </li>
              ))}
            </ul>,
            money(orderTotal(o)),
            <span key="status" className={`${styles.tag} ${o.status === 'Đã đặt' ? styles.ok : styles.mu}`}>{o.status}</span>,
            <Link key="open" href={`/officer/orders/${o.code}`} className={styles.link}>Chi tiết</Link>,
          ],
        }))}
      />
    </div>
  )
}
