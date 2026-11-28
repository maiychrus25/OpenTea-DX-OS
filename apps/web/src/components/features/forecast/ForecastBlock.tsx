// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import kit from '@/components/features/farmer-web/kit.module.css'
import type { ForecastView } from '@/lib/forecast/types'
import { dayMonth } from '@/lib/weighing/format'
import styles from './forecast.module.css'

const kg = (value: number) => value.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const BAR_MAX = 12

/** A text bar scaled to the biggest week, so the weekly shape reads without a chart library. */
export function textBar(value: number, max: number): string {
  if (max <= 0 || value <= 0) return ''
  return '▇'.repeat(Math.max(1, Math.round((value / max) * BAR_MAX)))
}

interface Props {
  forecast: ForecastView | null
}

/** The 14-day fresh and dry forecast for the workshop: weekly table with bars, and each parcel with its source. */
export function ForecastBlock({ forecast }: Props) {
  return (
    <section className={kit.pn} aria-labelledby="forecast-title">
      <div className={kit.ph}><h2 id="forecast-title">Dự báo 14 ngày tới</h2></div>
      {forecast === null && <p role="status" className={`${styles.pad} ${styles.failed}`}>Chưa tải được dự báo.</p>}
      {forecast && (
        <div className={styles.body}>
          <p className={styles.totals}>
            Búp tươi dự kiến <strong>{kg(forecast.total_fresh_kg)} kg</strong> · chè khô dự kiến <strong>{kg(forecast.total_dry_kg)} kg</strong>
          </p>
          {forecast.parcels.length === 0 ? (
            <p className={styles.muted}>Không có lứa nào dự kiến hái trong 14 ngày tới.</p>
          ) : (
            <>
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead><tr><th>Tuần từ</th><th>Khối lượng chè khô</th><th>Búp tươi</th><th>Chè khô</th></tr></thead>
                  <tbody>
                    {forecast.weeks.map(w => (
                      <tr key={w.week_start}>
                        <td>{dayMonth(w.week_start)}</td>
                        <td className={styles.bar} aria-hidden="true">{textBar(w.dry_kg, Math.max(...forecast.weeks.map(x => x.dry_kg)))}</td>
                        <td>{kg(w.fresh_kg)} kg</td>
                        <td>{kg(w.dry_kg)} kg</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className={styles.parcelList} aria-label="Dự báo từng thửa">
                {forecast.parcels.map(p => (
                  <li key={p.parcel_id} className={styles.parcel}>
                    <strong>{p.parcel_code}</strong>
                    <span className={styles.muted}>hái {dayMonth(p.harvest_on)} · {kg(p.fresh_kg)} kg búp → {kg(p.dry_kg)} kg khô</span>
                    {p.source === 'NORM'
                      ? <span className={styles.normBadge}>Theo định mức</span>
                      : <span className={styles.historyBadge}>Theo lịch sử</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  )
}
