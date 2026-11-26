// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState } from 'react'
import styles from './kit.module.css'

export interface Row {
  key: string
  group: string
  cells: React.ReactNode[]
}

/** A table with one row of filter chips above it. */
export function FilteredTable({ filters, columns, rows, numeric = [] }: { filters: string[]; columns: string[]; rows: Row[]; numeric?: number[] }) {
  const [filter, setFilter] = useState('Tất cả')
  const shown = rows.filter((row) => filter === 'Tất cả' || row.group === filter)
  const align = (index: number) => (numeric.includes(index) ? styles.num : undefined)

  return (
    <div className={styles.block}>
      <div className={styles.chips}>
        {['Tất cả', ...filters].map((name) => (
          <button key={name} type="button" className={styles.seg} aria-pressed={filter === name} onClick={() => setFilter(name)}>
            {name}
          </button>
        ))}
      </div>
      <div className={styles.tableBox}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((column, i) => <th key={column} scope="col" className={align(i)}>{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.key}>
                {row.cells.map((cell, i) => <td key={i} className={align(i)}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
