// SPDX-License-Identifier: MIT
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState } from 'react'
import { Stats } from './parts'
import styles from './kit.module.css'

export interface Row {
  key: string
  group: string
  rank?: Record<string, number>
  cells: React.ReactNode[]
}

export interface Figure {
  label: string
  value: string | number
  icon: React.ReactNode
  /** The group this figure stands for. */
  filter?: string
  /** Order the rows by this rank, largest first. */
  sort?: string
}

interface Props {
  figures?: Figure[]
  filters: string[]
  columns: string[]
  rows: Row[]
  numeric?: number[]
  /** Shown between the figures and the table. */
  children?: React.ReactNode
}

/** A table that the headline figures and a row of chips can filter. */
export function FilteredTable({ figures = [], filters, columns, rows, numeric = [], children }: Props) {
  const [view, setView] = useState<{ filter: string; sort?: string }>({ filter: 'Tất cả' })
  const shown = rows.filter((row) => view.filter === 'Tất cả' || row.group === view.filter)
  if (view.sort) shown.sort((a, b) => (b.rank?.[view.sort!] ?? 0) - (a.rank?.[view.sort!] ?? 0))
  const align = (index: number) => (numeric.includes(index) ? styles.num : undefined)

  return (
    <>
      {figures.length > 0 && <Stats items={figures.map((figure) => {
        const filter = figure.filter ?? 'Tất cả'
        return {
          label: figure.label,
          value: figure.value,
          icon: figure.icon,
          active: view.filter === filter && view.sort === figure.sort,
          onSelect: () => setView({ filter, sort: figure.sort }),
        }
      })} />}
      {children}
      <div className={styles.block}>
        {filters.length > 0 && (
          <div className={styles.chips}>
            {['Tất cả', ...filters].map((name) => (
              <button key={name} type="button" className={styles.seg} aria-pressed={view.filter === name} onClick={() => setView({ filter: name })}>
                {name}
              </button>
            ))}
          </div>
        )}
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
              {shown.length === 0 && <tr><td colSpan={columns.length} className={styles.none}>Không có mục nào.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
