// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { SampleTag } from './SampleTag'
import styles from './sample.module.css'

// The design's figures: there is no record of weekly harvests yet.
const ACTUAL = [3.2, 3.8, 4.1, 4.6, 5.2, 4.9, 5.6, 6.1, 5.8, 6.4, 6.9, 7.2]
const PLAN = [3.5, 3.8, 4.2, 4.5, 4.8, 5.0, 5.4, 5.7, 6.0, 6.3, 6.6, 7.0]
const TOP = 8

export function SampleYieldChart() {
  const y = (value: number) => 200 - (value / TOP) * 190

  return (
    <section className={styles.card} aria-label="Sản lượng theo tuần">
      <div className={styles.head}>
        <h2>Sản lượng theo tuần (tấn)</h2>
        <SampleTag />
        <span className={styles.legend}>
          <span><i />Thực tế</span>
          <span><i className={styles.plan} />Kế hoạch</span>
        </span>
      </div>
      <div className={styles.chart}>
        <div className={styles.plotRow}>
          <div className={styles.scale} aria-hidden="true">{[8, 6, 4, 2, 0].map(v => <span key={v}>{v}</span>)}</div>
          <svg viewBox="0 0 600 205" preserveAspectRatio="none" role="img" aria-label="Biểu đồ mẫu: sản lượng thực tế so với kế hoạch trong 12 tuần">
            {[0, 2, 4, 6, 8].map((v) => <line key={v} x1="0" x2="600" y1={y(v)} y2={y(v)} />)}
            {ACTUAL.map((v, i) => (
              <rect key={i} className={i === ACTUAL.length - 1 ? styles.last : undefined} x={i * 50 + 15} width="20" y={y(v)} height={200 - y(v)} rx="3">
                <title>{`Tuần ${36 + i}: ${v.toLocaleString('vi-VN')} tấn (kế hoạch ${PLAN[i].toLocaleString('vi-VN')})`}</title>
              </rect>
            ))}
            <polyline points={PLAN.map((v, i) => `${i * 50 + 25},${y(v)}`).join(' ')} />
          </svg>
        </div>
        <div className={`${styles.axis} ${styles.weeks}`}>{ACTUAL.map((_, i) => <span key={i}>T{36 + i}</span>)}</div>
      </div>
    </section>
  )
}
