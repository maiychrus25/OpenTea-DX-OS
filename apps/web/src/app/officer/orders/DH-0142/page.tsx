// SPDX-License-Identifier: MIT
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

/* eslint-disable @next/next/no-img-element -- small drawings shipped with the page */

import React from 'react'
import Link from 'next/link'
import { Package } from 'lucide-react'
import { Header } from '@/components/features/officer-web/parts'
import { ORDERS, PRODUCTS, money } from '@/components/features/officer-web/sample'
import styles from '@/components/features/officer-web/kit.module.css'

export const metadata = { title: 'Chi tiết đơn' }

/** Sample content: there is no order service yet. */
export default function OfficerOrderPage() {
  const order = ORDERS[0]
  const lines = [{ product: PRODUCTS[0], quantity: 2 }, { product: PRODUCTS[1], quantity: 3 }]
  const facts = [['Mã đơn', order.code], ['Người nhận', order.name], ['Điện thoại', order.phone], ['Địa chỉ', 'Xóm Cầu Gỗ, xã Tân Cương'], ['Thanh toán', 'Chuyển khoản'], ['Trạng thái', order.status]]

  return (
    <div className={styles.page}>
      <Link href="/officer/orders" className={styles.back}>← Quay lại</Link>
      <Header icon={<Package size={24} />} title="Chi tiết đơn" description={order.code} />
      <div className={styles.columns}>
        <section className={styles.pn}>
          <h2 className={styles.ph}>Thông tin đơn</h2>
          <dl className={styles.facts}>
            {facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
        </section>
        <section className={`${styles.pn} ${styles.wide}`}>
          <h2 className={styles.ph}>Sản phẩm</h2>
          <table className={styles.table}>
            <tbody>
              {lines.map(({ product, quantity }) => (
                <tr key={product.name}>
                  <td><span className={styles.item}><img src={`/images/officer/${product.image}.svg`} alt="" />{product.name}</span></td>
                  <td className={styles.num}>{quantity} × {money(product.price)}</td>
                  <td className={styles.num}>{money(quantity * product.price)}</td>
                </tr>
              ))}
              <tr><td colSpan={2}><strong>Tổng cộng</strong></td><td className={styles.num}><strong>{money(order.total)}</strong></td></tr>
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}
