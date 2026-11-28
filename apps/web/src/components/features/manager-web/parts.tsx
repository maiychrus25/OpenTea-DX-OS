// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import styles from './kit.module.css'

/** Marks what the design shows but the system has no data or function for yet. */
export function Sample() {
  return <span className={styles.sample}>Mẫu</span>
}

export interface StatCard {
  label: string
  value: string
  icon: React.ReactNode
  tone?: 'amber' | 'red'
  /** Percent against the earlier period; left out when there is nothing to compare with. */
  change?: number | null
  note?: string
  /** The figure is an example, not data. */
  sample?: boolean
}

const percent = (value: number) => `${value >= 0 ? '↑ +' : '↓ '}${value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`

export function StatCards({ items }: { items: StatCard[] }) {
  return (
    <dl className={styles.stats}>
      {items.map((item) => (
        <div key={item.label} className={styles.stat}>
          <span className={`${styles.statIcon} ${item.tone ? styles[item.tone] : ''}`} aria-hidden="true">{item.icon}</span>
          <div className={styles.statText}>
            <dt>{item.label}{item.sample && <> <Sample /></>}</dt>
            <dd className={styles.statValue}>{item.value}</dd>
            {(item.change != null || item.note) && (
              <dd className={styles.statNote}>
                {item.change != null && <span className={item.change >= 0 ? styles.up : styles.down}>{percent(item.change)}</span>}
                {item.note}
              </dd>
            )}
          </div>
        </div>
      ))}
    </dl>
  )
}

export function Tabs<T extends string>({ label, items, value, onChange }: { label: string; items: { key: T; label: string }[]; value: T; onChange: (key: T) => void }) {
  return (
    <div className={styles.tabs} role="group" aria-label={label}>
      {items.map((item) => (
        <button key={item.key} type="button" className={styles.tab} aria-pressed={item.key === value} onClick={() => onChange(item.key)}>
          {item.label}
        </button>
      ))}
    </div>
  )
}

export const PAGE_SIZE = 10

/** The rows of one page, with the page number kept inside what the list has. */
export function pageOf<T>(rows: T[], page: number, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(rows.length / size))
  const current = Math.min(Math.max(1, page), pages)
  const start = (current - 1) * size
  return { rows: rows.slice(start, start + size), current, pages, start }
}

export function Pager({ current, pages, start, shown, total, unit, onPage }: { current: number; pages: number; start: number; shown: number; total: number; unit: string; onPage: (page: number) => void }) {
  // At most five page numbers around the current one.
  const first = Math.max(1, Math.min(current - 2, pages - 4))
  const numbers = Array.from({ length: Math.min(5, pages) }, (_, i) => first + i)
  return (
    <div className={styles.pager}>
      <span>Hiển thị {total === 0 ? 0 : start + 1} – {start + shown} trong tổng {total} {unit}</span>
      {pages > 1 && (
        <nav className={styles.pages} aria-label="Phân trang">
          <button type="button" className={styles.page} aria-label="Trang trước" disabled={current === 1} onClick={() => onPage(current - 1)}><ChevronLeft size={16} aria-hidden="true" /></button>
          {numbers.map((n) => <button key={n} type="button" className={styles.page} aria-current={n === current ? 'page' : undefined} onClick={() => onPage(n)}>{n}</button>)}
          <button type="button" className={styles.page} aria-label="Trang sau" disabled={current === pages} onClick={() => onPage(current + 1)}><ChevronRight size={16} aria-hidden="true" /></button>
        </nav>
      )}
    </div>
  )
}
