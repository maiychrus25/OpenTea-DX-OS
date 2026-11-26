// SPDX-License-Identifier: MIT
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { PageHeader } from '@/components/ui/PageHeader/PageHeader'
import styles from './kit.module.css'

export function Header({ icon, title, description }: { icon: React.ReactNode; title: string; description?: string }) {
  return <PageHeader icon={icon} title={title} description={description} actions={<span className={`${styles.tag} ${styles.mu}`}>Chỉ xem (cán bộ)</span>} />
}

/** Officer-only headline figures; callers supply counts from their loaded data. */
export function Stats({ items }: { items: { label: string; value: string | number; icon: React.ReactNode }[] }) {
  if (items.length === 0) return null

  return (
    <dl className={styles.stats}>
      {items.map((item) => (
        <div key={item.label} className={styles.stat}>
          <dt><span className={styles.statIcon} aria-hidden="true">{item.icon}</span>{item.label}</dt>
          <dd>{typeof item.value === 'number' ? item.value.toLocaleString('vi-VN') : item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
