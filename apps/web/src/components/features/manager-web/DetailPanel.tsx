// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import styles from './kit.module.css'

export interface DetailRow { icon: React.ReactNode; label: string; value: React.ReactNode }

/** The panel beside a list: what the chosen row holds, its total and what can be done with it. */
export function DetailPanel({ title, status, rows, totalLabel, total, extra, children }: { title: string; status?: React.ReactNode; rows: DetailRow[]; totalLabel?: string; total?: string; extra?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <aside className={styles.detail} aria-label={title}>
      <div className={styles.detailHead}><h2>{title}</h2>{status}</div>
      <dl>
        {rows.map((row) => (
          <div key={row.label}><dt><span aria-hidden="true">{row.icon}</span>{row.label}</dt><dd>{row.value}</dd></div>
        ))}
      </dl>
      {total !== undefined && <p className={styles.total}><span>{totalLabel}</span><strong>{total}</strong></p>}
      {extra}
      {children && <div className={styles.detailActions}>{children}</div>}
    </aside>
  )
}
