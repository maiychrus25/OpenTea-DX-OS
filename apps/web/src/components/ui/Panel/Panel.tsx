// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React, { useId } from 'react'
import Link from 'next/link'
import styles from './Panel.module.css'

export interface PanelProps {
  title: string
  href?: string
  linkLabel?: string
  extra?: React.ReactNode
  children: React.ReactNode
  className?: string
  testId?: string
}

export function Panel({ title, href, linkLabel = 'Xem tất cả', extra, children, className, testId }: PanelProps) {
  const id = useId()
  return (
    <section className={`${styles.panel} ${className ?? ''}`.trim()} aria-labelledby={id} data-testid={testId}>
      <div className={styles.head}>
        <h2 id={id} className={styles.title}>{title}</h2>
        {extra}
        {href && <Link href={href} className={styles.link}>{linkLabel}</Link>}
      </div>
      <div className={styles.body}>{children}</div>
    </section>
  )
}
