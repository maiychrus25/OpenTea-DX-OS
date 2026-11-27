// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/* eslint-disable @next/next/no-img-element -- small photos shipped with the page */

import React from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Package } from 'lucide-react'
import { Header } from '@/components/features/officer-web/parts'
import { PRODUCTS, money, productOrders, productPhoto } from '@/components/features/officer-web/sample'
import styles from '@/components/features/officer-web/kit.module.css'

export const metadata = { title: 'Người đặt sản phẩm' }

/** Who ordered one product. Sample content: there is no order service yet. */
export default function OfficerProductOrdersPage({ params }: { params: { code: string } }) {
  const product = PRODUCTS.find((p) => p.code === params.code)
  if (!product) notFound()
  const { orders, buyers, quantity, value } = productOrders(product)

  return (
    <div className={styles.page}>
      <Link href="/officer/orders" className={styles.back}>← Quay lại</Link>
      <Header icon={<Package size={24} />} title="Người đặt sản phẩm" description={`${product.code} · ${product.name}`} />
      <div className={styles.columns}>
        <section className={styles.pn}>
          <h2 className={styles.ph}>Sản phẩm</h2>
          <dl className={styles.facts}>
            <div><dt>Ảnh</dt><dd><img className={styles.photo} src={productPhoto(product.image)} alt={product.name} /></dd></div>
            <div><dt>Tên</dt><dd>{product.name}</dd></div>
            <div><dt>Quy cách</dt><dd>{product.pack}</dd></div>
            <div><dt>Giá bán</dt><dd>{money(product.price)}</dd></div>
            <div><dt>Số người đặt</dt><dd>{buyers}</dd></div>
            <div><dt>Số lượng</dt><dd>{quantity}</dd></div>
            <div><dt>Thành tiền</dt><dd>{money(value)}</dd></div>
          </dl>
        </section>
        <section className={`${styles.pn} ${styles.wide}`}>
          <h2 className={styles.ph}>Danh sách người đặt</h2>
          <table className={styles.table}>
            <thead>
              <tr><th scope="col">Mã đơn</th><th scope="col">Người đặt</th><th scope="col">Địa chỉ</th><th scope="col" className={styles.num}>Số lượng</th><th scope="col">Trạng thái</th></tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.code}>
                  <td className={styles.mono}>{order.code}</td>
                  <td><strong>{order.name}</strong><br /><span className={styles.muted}>{order.phone}</span></td>
                  <td>{order.address}</td>
                  <td className={styles.num}>{order.quantity}</td>
                  <td><span className={`${styles.tag} ${order.status === 'Đã đặt' ? styles.ok : styles.mu}`}>{order.status}</span></td>
                </tr>
              ))}
              {orders.length === 0 && <tr><td colSpan={5} className={styles.none}>Chưa có ai đặt sản phẩm này.</td></tr>}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}
