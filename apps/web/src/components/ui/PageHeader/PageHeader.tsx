// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import styles from './PageHeader.module.css'

export interface PageHeaderProps {
  icon: React.ReactNode
  title: string
  description?: string
  actions?: React.ReactNode
}

export function PageHeader({ icon, title, description, actions }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <span className={styles.iconBox} aria-hidden="true">{icon}</span>
      <div className={styles.text}>
        <h1 className={styles.title}>{title}</h1>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  )
}
