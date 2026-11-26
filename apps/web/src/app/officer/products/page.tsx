// SPDX-License-Identifier: MIT
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

/* eslint-disable @next/next/no-img-element -- small drawings shipped with the page */

import React from 'react'
import { Store, PackageX, Boxes } from 'lucide-react'
import { FilteredTable } from '@/components/features/officer-web/FilteredTable'
import { Header } from '@/components/features/officer-web/parts'
import { PRODUCTS, money, sum } from '@/components/features/officer-web/sample'
import styles from '@/components/features/officer-web/kit.module.css'

export const metadata = { title: 'Sản phẩm' }

/** Sample content: there is no product service yet. */
export default function OfficerProductsPage() {
  return (
    <div className={styles.page}>
      <Header icon={<Store size={24} />} title="Sản phẩm" description="Gian hàng của HTX. Chỉnh sửa sản phẩm sẽ làm cùng API ở mốc M2; hiện chỉ xem." />
      <FilteredTable
        figures={[
          { label: 'Sản phẩm', value: PRODUCTS.length, icon: <Store /> },
          { label: 'Hết hàng', value: PRODUCTS.filter((p) => p.stock === 0).length, icon: <PackageX />, filter: 'Hết hàng' },
          { label: 'Tổng tồn kho', value: sum(PRODUCTS, (p) => p.stock), icon: <Boxes />, sort: 'stock' },
        ]}
        filters={['Còn hàng', 'Hết hàng']}
        columns={['Sản phẩm', 'Quy cách', 'Giá bán', 'Tồn kho', 'Trạng thái']}
        numeric={[2, 3]}
        rows={PRODUCTS.map((p) => ({
          key: p.name,
          group: p.stock ? 'Còn hàng' : 'Hết hàng',
          rank: { stock: p.stock },
          cells: [
            <span key="name" className={styles.item}><img src={`/images/officer/${p.image}.svg`} alt="" />{p.name}</span>,
            p.pack,
            money(p.price),
            p.stock,
            <span key="status" className={`${styles.tag} ${p.stock ? styles.ok : styles.bd}`}>{p.stock ? 'Còn hàng' : 'Hết hàng'}</span>,
          ],
        }))}
      />
    </div>
  )
}
