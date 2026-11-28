// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import styles from './reports.module.css'

const kg = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })
/** Grades are ordered, so they take steps of one green. */
export const shade = (index: number, total: number) => `color-mix(in srgb, var(--color-primary) ${100 - (index * 70) / Math.max(1, total - 1)}%, var(--color-surface-card))`

export function Donut({ parts }: { parts: { label: string; kg: number }[] }) {
  const total = parts.reduce((sum, p) => sum + p.kg, 0)
  let start = 0
  return (
    <svg className={styles.donut} viewBox="0 0 42 42" role="img" aria-label={`Tổng sản lượng ${kg(total)} kg`}>
      {parts.map((part, index) => {
        const share = total ? (part.kg / total) * 100 : 0
        const circle = <circle key={part.label} cx="21" cy="21" r="15.915" fill="none" stroke={shade(index, parts.length)} strokeWidth="6" strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={25 - start}><title>{`${part.label}: ${kg(part.kg)} kg`}</title></circle>
        start += share
        return circle
      })}
      <text x="21" y="21" textAnchor="middle" className={styles.donutValue}>{kg(total)} kg</text>
      <text x="21" y="25.5" textAnchor="middle" className={styles.donutNote}>Tổng sản lượng</text>
    </svg>
  )
}

export function LineChart({ points }: { points: { label: string; kg: number }[] }) {
  const top = Math.max(...points.map((p) => p.kg), 1) * 1.15
  const x = (i: number) => (points.length === 1 ? 50 : (i / (points.length - 1)) * 96 + 2)
  const y = (value: number) => 100 - (value / top) * 100
  const line = points.map((p, i) => `${x(i)},${y(p.kg)}`).join(' ')
  return (
    <div className={styles.line}>
      <ul aria-hidden="true">{[4, 3, 2, 1, 0].map((n) => <li key={n}>{kg(Math.round((top / 4) * n))}</li>)}</ul>
      <div>
        <div className={styles.plot}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polygon points={`${x(0)},100 ${line} ${x(points.length - 1)},100`} className={styles.area} />
            <polyline points={line} className={styles.stroke} />
          </svg>
          {points.map((p, i) => <i key={p.label} style={{ left: `${x(i)}%`, top: `${y(p.kg)}%` }} title={`Tuần từ ${p.label}: ${kg(p.kg)} kg`} />)}
        </div>
        <ol>{points.map((p) => <li key={p.label}>{p.label}</li>)}</ol>
      </div>
    </div>
  )
}
