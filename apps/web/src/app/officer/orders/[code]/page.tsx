// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/* eslint-disable @next/next/no-img-element -- small drawings shipped with the page */

import React from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Package } from 'lucide-react'
import { Header } from '@/components/features/officer-web/parts'
import { ORDERS, money, orderLines, orderTotal } from '@/components/features/officer-web/sample'
import styles from '@/components/features/officer-web/kit.module.css'

export const metadata = { title: 'Chi tiết đơn' }

/** Sample content: there is no order service yet. */
export default function OfficerOrderPage({ params }: { params: { code: string } }) {
  const order = ORDERS.find((o) => o.code === params.code)
  if (!order) notFound()
  const facts = [['Mã đơn', order.code], ['Người đặt', order.name], ['Điện thoại', order.phone], ['Địa chỉ', order.address], ['Thanh toán', 'Chuyển khoản'], ['Trạng thái', order.status]]

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
          <h2 className={styles.ph}>Sản phẩm đã mua</h2>
          <table className={styles.table}>
            <tbody>
              {orderLines(order).map(({ product, quantity }) => (
                <tr key={product.name}>
                  <td><span className={styles.tourName}><img src={`/images/officer/${product.image}.svg`} alt="" />{product.name}</span></td>
                  <td className={styles.num}>{quantity} × {money(product.price)}</td>
                  <td className={styles.num}>{money(quantity * product.price)}</td>
                </tr>
              ))}
              <tr><td colSpan={2}><strong>Tổng cộng</strong></td><td className={styles.num}><strong>{money(orderTotal(order))}</strong></td></tr>
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}
