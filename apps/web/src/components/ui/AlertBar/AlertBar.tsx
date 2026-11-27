// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import styles from './AlertBar.module.css'

export interface AlertBarProps {
  children: React.ReactNode
  href?: string
  linkLabel?: string
}

export function AlertBar({ children, href, linkLabel = 'Chi tiết' }: AlertBarProps) {
  return (
    <div className={styles.bar} role="status">
      <AlertTriangle size={20} className={styles.icon} aria-hidden="true" />
      <div className={styles.text}>{children}</div>
      {href && <Link href={href} className={styles.link}>{linkLabel}</Link>}
    </div>
  )
}
