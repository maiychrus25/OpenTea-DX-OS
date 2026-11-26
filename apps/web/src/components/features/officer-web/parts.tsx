// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { PageHeader } from '@/components/ui/PageHeader/PageHeader'
import styles from './kit.module.css'

export function Header({ icon, title, description }: { icon: React.ReactNode; title: string; description?: string }) {
  return <PageHeader icon={icon} title={title} description={description} actions={<span className={`${styles.tag} ${styles.mu}`}>Chỉ xem (cán bộ)</span>} />
}

/** The headline figures in one strip. */
export function Stats({ items }: { items: { label: string; value: string | number }[] }) {
  return (
    <dl className={styles.stats}>
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
