// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/* eslint-disable @next/next/no-img-element -- small photos shipped with the page */

import React from 'react'
import Link from 'next/link'
import { Boxes, Package, ShoppingBag, Wallet } from 'lucide-react'
import { FilteredTable } from '@/components/features/officer-web/FilteredTable'
import { Header } from '@/components/features/officer-web/parts'
import { PRODUCTS, money, productOrders, productPhoto, sum } from '@/components/features/officer-web/sample'
import styles from '@/components/features/officer-web/kit.module.css'

export const metadata = { title: 'Đơn hàng' }

/** Orders counted by product. Sample content: there is no order service yet. */
export default function OfficerOrdersPage() {
  const rows = PRODUCTS.map((product) => ({ product, ...productOrders(product) }))
  const ordered = rows.filter((r) => r.quantity > 0)

  return (
    <div className={styles.page}>
      <Header icon={<Package size={24} />} title="Đơn hàng" description="Tính theo từng sản phẩm. Hàng có sẵn nên khách đặt là xong, không cần HTX duyệt." />
      <FilteredTable
        figures={[
          { label: 'Sản phẩm có người đặt', value: ordered.length, icon: <ShoppingBag />, filter: 'Có người đặt' },
          { label: 'Số lượng đã đặt', value: sum(rows, (r) => r.quantity), icon: <Boxes />, filter: 'Có người đặt', sort: 'quantity' },
          { label: 'Giá trị đặt', value: money(sum(rows, (r) => r.value)), icon: <Wallet />, filter: 'Có người đặt', sort: 'value' },
        ]}
        filters={['Có người đặt', 'Chưa có đơn']}
        columns={['Mã SP', 'Sản phẩm', 'Giá bán', 'Số người đặt', 'Số lượng', 'Thành tiền', 'Thao tác']}
        numeric={[2, 3, 4, 5]}
        rows={rows.map(({ product, buyers, quantity, value }) => ({
          key: product.code,
          group: quantity > 0 ? 'Có người đặt' : 'Chưa có đơn',
          rank: { quantity, value },
          cells: [
            <span key="code" className={styles.mono}>{product.code}</span>,
            <span key="product" className={styles.item}>
              <img src={productPhoto(product.image)} alt="" />
              <span>{product.name}<br /><span className={styles.muted}>{product.pack}</span></span>
            </span>,
            money(product.price),
            buyers,
            quantity,
            money(value),
            <Link key="open" href={`/officer/orders/${product.code}`} className={styles.link}>Xem người đặt</Link>,
          ],
        }))}
      />
    </div>
  )
}
