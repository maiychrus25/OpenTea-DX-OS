// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React, { useId } from 'react'
import { ACTIVITY_LABELS, type weeklyActivity } from './overview-data'
import styles from './overview.module.css'

/** Inflow counts, not a reconstruction of historical totals. The caption states the cohort. */
export function OverviewSparkline({ values, label }: { values: number[]; label: string }) {
  if (!values.some(Boolean)) return null
  const max = Math.max(1, ...values)
  const points = values.map((value, index) => `${4 + index * 12},${28 - value / max * 24}`).join(' ')
  return (
    <span className={styles.sparkline} title={`${label}: ${values.join(', ')}`}>
      <svg viewBox="0 0 80 32" role="img" aria-label={`${label}, từ cũ đến mới: ${values.join(', ')}`}>
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" />
        {values.map((value, index) => <circle key={index} cx={4 + index * 12} cy={28 - value / max * 24} r="2" fill="currentColor"><title>{`Ngày ${index + 1}: ${value}`}</title></circle>)}
      </svg>
    </span>
  )
}

export function OverviewActivityChart({ weeks }: { weeks: ReturnType<typeof weeklyActivity> }) {
  const id = useId().replace(/:/g, '')
  const types = Object.keys(ACTIVITY_LABELS).filter(type => weeks.some(week => week.counts[type] > 0))
  const max = Math.max(1, ...weeks.map(week => week.total))
  if (!types.length) return <p className={styles.empty}>Chưa có hoạt động canh tác trong 30 ngày.</p>
  return (
    <div className={styles.chartBody}>
      <p className={styles.caption}>Số nhật ký theo ngày hoạt động · mọi trạng thái</p>
      <svg className={styles.chart} viewBox="0 0 440 164" role="img" aria-label="Số nhật ký theo tuần và loại hoạt động; số liệu chi tiết bên dưới">
        <defs>
          {types.map(type => {
            const index = Object.keys(ACTIVITY_LABELS).indexOf(type)
            return <pattern key={type} id={`${id}-${type}`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform={`rotate(${index * 30})`}>
              <rect width="8" height="8" className={styles.plotFill} />
              <path d={index % 2 ? 'M0 0V8 M4 0V8' : 'M0 0V8'} className={styles.plotTexture} strokeWidth="2" />
            </pattern>
          })}
        </defs>
        {[0, max].map(value => <g key={value}>
          <line x1="28" x2="432" y1={128 - value / max * 100} y2={128 - value / max * 100} className={styles.gridLine} />
          <text x="24" y={132 - value / max * 100} textAnchor="end">{value}</text>
        </g>)}
        {weeks.map((week, index) => {
          let offset = 0
          return <g key={week.label}>
            {types.map(type => {
              const count = week.counts[type]
              const height = count / max * 100
              const y = 128 - offset - height
              offset += height
              return count > 0 ? <rect key={type} x={42 + index * 79} y={y} width="40" height={height} fill={`url(#${id}-${type})`} className={styles.segment} tabIndex={0} aria-label={`${week.label}: ${ACTIVITY_LABELS[type]} ${count}`}>
                <title>{`${week.label} · ${ACTIVITY_LABELS[type]}: ${count} nhật ký`}</title>
              </rect> : null
            })}
            <text x={62 + index * 79} y={120 - week.total / max * 100} textAnchor="middle" className={styles.total}>{week.total}</text>
            <text x={62 + index * 79} y="149" textAnchor="middle">{week.label}</text>
          </g>
        })}
      </svg>
      <ul className={styles.legend} aria-label="Loại hoạt động">
        {types.map(type => <li key={type}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><rect width="16" height="16" fill={`url(#${id}-${type})`} /></svg>
          {ACTIVITY_LABELS[type]}
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
