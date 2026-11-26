// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

/* eslint-disable @next/next/no-img-element -- small drawings shipped with the page */

import React from 'react'
import { Store, PackageX, Boxes } from 'lucide-react'
import { Header, Stats } from '@/components/features/officer-web/parts'
import { PRODUCTS, money, sum } from '@/components/features/officer-web/sample'
import styles from '@/components/features/officer-web/kit.module.css'

export const metadata = { title: 'Sản phẩm' }

/** Sample content: there is no product service yet. */
export default function OfficerProductsPage() {
  return (
    <div className={styles.page}>
      <Header icon={<Store size={24} />} title="Sản phẩm" description="Gian hàng của HTX. Chỉnh sửa sản phẩm sẽ làm cùng API ở mốc M2; hiện chỉ xem." />
      <Stats items={[
        { label: 'Sản phẩm', value: PRODUCTS.length, icon: <Store /> },
        { label: 'Hết hàng', value: PRODUCTS.filter((p) => p.stock === 0).length, icon: <PackageX /> },
        { label: 'Tổng tồn kho', value: sum(PRODUCTS, (p) => p.stock), icon: <Boxes /> },
      ]} />
      <div className={styles.tableBox}>
        <table className={styles.table}>
          <thead>
            <tr><th scope="col">Sản phẩm</th><th scope="col">Quy cách</th><th scope="col" className={styles.num}>Giá bán</th><th scope="col" className={styles.num}>Tồn kho</th><th scope="col">Trạng thái</th></tr>
          </thead>
          <tbody>
            {PRODUCTS.map((p) => (
              <tr key={p.name}>
                <td><span className={styles.item}><img src={`/images/officer/${p.image}.svg`} alt="" />{p.name}</span></td>
                <td>{p.pack}</td>
                <td className={styles.num}>{money(p.price)}</td>
                <td className={styles.num}>{p.stock}</td>
                <td><span className={`${styles.tag} ${p.stock ? styles.ok : styles.bd}`}>{p.stock ? 'Còn hàng' : 'Hết hàng'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
