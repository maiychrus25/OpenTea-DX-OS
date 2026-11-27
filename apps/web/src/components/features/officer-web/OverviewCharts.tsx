// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { ACTIVITY_LABELS, type weeklyActivity } from './overview-data'
import styles from './overview.module.css'

/** New items per day over the week, oldest first. The caption states what is counted. */
export function OverviewSparkline({ values, label }: { values: number[]; label: string }) {
  // one or two busy days say nothing about a week
  if (values.filter(Boolean).length < 3) return null
  const max = Math.max(1, ...values)
  return (
    <span className={styles.sparkline} title={`${label}: ${values.join(', ')}`}>
      <svg viewBox="0 0 68 28" role="img" aria-label={`${label}, từ cũ đến mới: ${values.join(', ')}`}>
        {values.map((value, index) => {
          const height = value ? Math.max(4, (value / max) * 26) : 2
          return (
            <rect key={index} x={index * 10} y={28 - height} width="7" height={height} rx="2" className={value ? styles.sparkBar : styles.sparkEmpty}>
              <title>{`Ngày ${index + 1}: ${value}`}</title>
            </rect>
          )
        })}
      </svg>
    </span>
  )
}

/** Each activity keeps its own colour, whatever else is on screen. Stacked bottom to top in this order. */
const SERIES = ['IRRIGATION', 'FERTILIZING', 'SPRAYING', 'HARVEST', 'SOWING', 'OTHER']
const COLORS = ['var(--color-series-1)', 'var(--color-series-2)', 'var(--color-series-3)', 'var(--color-series-4)', 'var(--color-series-5)', 'var(--color-series-6)']
const colorOf = (type: string) => COLORS[SERIES.indexOf(type)]

/** A bar segment with rounded top corners, for the top of a stack. */
const rounded = (x: number, y: number, width: number, height: number) => {
  const r = Math.min(4, height)
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`
}

export function OverviewActivityChart({ weeks }: { weeks: ReturnType<typeof weeklyActivity> }) {
  const types = SERIES.filter(type => weeks.some(week => week.counts[type] > 0))
  if (!types.length) return <p className={styles.empty}>Chưa có hoạt động canh tác trong 30 ngày.</p>
  const step = Math.max(1, Math.ceil(Math.max(...weeks.map(week => week.total)) / 4))
  const top = step * 4
  const y = (value: number) => 150 - (value / top) * 132
  const slot = 408 / weeks.length
  const width = Math.min(34, slot * 0.5)

  return (
    <div className={styles.chartBody}>
      <p className={styles.caption}>Số nhật ký theo tuần, gồm mọi trạng thái</p>
      <svg className={styles.chart} viewBox="0 0 440 172" role="img" aria-label="Số nhật ký theo tuần và loại hoạt động; số liệu chi tiết bên dưới">
        {[0, 1, 2, 3, 4].map(line => (
          <g key={line}>
            <line x1="26" x2="434" y1={y(line * step)} y2={y(line * step)} className={styles.gridLine} />
            <text x="18" y={y(line * step) + 3} textAnchor="end" className={styles.tick}>{line * step}</text>
          </g>
        ))}
        {weeks.map((week, index) => {
          const x = 28 + index * slot + (slot - width) / 2
          const parts = types.filter(type => week.counts[type] > 0)
          let done = 0
          return (
            <g key={week.label}>
              {parts.map((type, i) => {
                const count = week.counts[type]
                const base = y(done)
                done += count
                // 2px of the card shows between the segments of a stack
                const gap = i === 0 ? 0 : 2
                const height = Math.max(1, base - y(done) - gap)
                const props = { key: type, fill: colorOf(type), className: styles.segment, tabIndex: 0, 'aria-label': `${week.label}: ${ACTIVITY_LABELS[type]} ${count}` }
                const title = <title>{`${week.label} · ${ACTIVITY_LABELS[type]}: ${count} nhật ký`}</title>
                return i === parts.length - 1
                  ? <path {...props} key={type} d={rounded(x, y(done), width, height)}>{title}</path>
                  : <rect {...props} key={type} x={x} y={y(done)} width={width} height={height}>{title}</rect>
              })}
              {week.total > 0 && <text x={x + width / 2} y={y(week.total) - 5} textAnchor="middle" className={styles.total}>{week.total}</text>}
              <text x={x + width / 2} y="166" textAnchor="middle" className={styles.tick}>{week.label.slice(0, 5)}</text>
            </g>
          )
        })}
      </svg>
      <ul className={styles.legend} aria-label="Loại hoạt động">
        {types.map(type => <li key={type}>
          <i style={{ background: colorOf(type) }} aria-hidden="true" />
          {ACTIVITY_LABELS[type]} <b>{weeks.reduce((sum, week) => sum + week.counts[type], 0)}</b>
        </li>)}
      </ul>
      <details className={styles.chartData}>
        <summary>Xem số liệu từng tuần</summary>
        <div className={styles.tableWrap} tabIndex={0} aria-label="Số liệu hoạt động canh tác">
          <table className={styles.table}><thead><tr><th>Tuần</th>{types.map(type => <th key={type}>{ACTIVITY_LABELS[type]}</th>)}<th>Tổng</th></tr></thead>
            <tbody>{weeks.map(week => <tr key={week.label}><td>{week.label}</td>{types.map(type => <td key={type}>{week.counts[type]}</td>)}<td>{week.total}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
