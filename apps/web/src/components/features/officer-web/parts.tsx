// SPDX-License-Identifier: MIT
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import styles from './kit.module.css'

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
