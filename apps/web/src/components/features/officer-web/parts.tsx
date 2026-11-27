// SPDX-License-Identifier: MIT
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { PageHeader } from '@/components/ui/PageHeader/PageHeader'
import { SampleTag } from '@/components/features/sample/SampleTag'
import styles from './kit.module.css'

export function Header({ icon, title, description }: { icon: React.ReactNode; title: string; description?: string }) {
  // Every page with this header shows made-up shop and tour records: there is no API for them yet.
  return (
    <>
      <PageHeader icon={icon} title={title} description={description} actions={<span className={`${styles.tag} ${styles.mu}`}>Chỉ xem (cán bộ)</span>} />
      <p role="note" className={styles.sampleNote}><SampleTag /> Tên khách, số điện thoại, đơn hàng và doanh thu trên trang này là dữ liệu mẫu, chưa có số liệu thật.</p>
    </>
  )
}

/** Officer-only headline figures; callers supply counts from their loaded data. */
export interface Stat {
  label: string
  value: string | number
  icon: React.ReactNode
  active?: boolean
  /** Makes the whole figure a button that shows the matching rows below. */
  onSelect?: () => void
}

export function Stats({ items }: { items: Stat[] }) {
  if (items.length === 0) return null

  return (
    <dl className={styles.stats}>
      {items.map((item) => (
        <div key={item.label} className={`${styles.stat}${item.onSelect ? ` ${styles.pick}` : ''}${item.active ? ` ${styles.picked}` : ''}`}>
          <dt>
            <span className={styles.statIcon} aria-hidden="true">{item.icon}</span>{item.label}
            {item.onSelect && <button type="button" className={styles.hit} aria-label={`Xem ${item.label}`} aria-pressed={item.active} onClick={item.onSelect} />}
          </dt>
          <dd>{typeof item.value === 'number' ? item.value.toLocaleString('vi-VN') : item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
