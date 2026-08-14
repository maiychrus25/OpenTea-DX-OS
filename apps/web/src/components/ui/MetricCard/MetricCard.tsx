// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import styles from './MetricCard.module.css'

interface MetricCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  detail?: string
  tone?: 'green' | 'amber' | 'blue' | 'neutral'
}

export function MetricCard({ icon, label, value, detail, tone = 'green' }: MetricCardProps) {
  return (
    <article className={`${styles.card} ${styles[tone]}`} data-testid="metric-card">
      <div className={styles.iconWrap}>{icon}</div>
      <div className={styles.content}>
        <p className={styles.label}>{label}</p>
        <strong className={styles.value}>{value}</strong>
        {detail && <span className={styles.detail}>{detail}</span>}
      </div>
    </article>
  )
}
