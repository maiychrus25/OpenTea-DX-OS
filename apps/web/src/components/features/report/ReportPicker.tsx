// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { localDay } from '@/domain/shared/local-day'
import { yearPeriod } from '@/lib/report/period'
import styles from './report.module.css'

interface Props {
  /** "/manager" or "/accountant". */
  basePath: string
}

/** Chooses the period: this year, last year, or a custom range. A plain GET form, so it works without script. */
export function ReportPicker({ basePath }: Props) {
  const thisYear = Number(localDay(new Date()).slice(0, 4))
  const current = yearPeriod(thisYear)
  const last = yearPeriod(thisYear - 1)
  const viewHref = `${basePath}/reports/view`
  return (
    <div className={styles.sections}>
      <section className={styles.section} aria-labelledby="period-presets">
        <h2 id="period-presets" className={styles.sectionTitle}>Chọn kỳ báo cáo</h2>
        <div className={styles.reportHead}>
          <a className={styles.primaryLink} href={`${viewHref}?from=${current.from}&to=${current.to}`}>Năm {thisYear}</a>
          <a className={styles.primaryLink} href={`${viewHref}?from=${last.from}&to=${last.to}`}>Năm {thisYear - 1}</a>
        </div>
      </section>
      <section className={styles.section} aria-labelledby="period-custom">
        <h2 id="period-custom" className={styles.sectionTitle}>Khoảng ngày khác</h2>
        <p className={styles.muted}>Báo cáo tối đa ba năm.</p>
        <form action={viewHref} method="get" className={styles.form}>
          <div className={styles.pickerGrid}>
            <label className={styles.label}>
              Từ ngày
              <input className={styles.inp} type="date" name="from" required />
            </label>
            <label className={styles.label}>
              Đến ngày
              <input className={styles.inp} type="date" name="to" required />
            </label>
          </div>
          <button type="submit" className={styles.primaryLink}>Xem báo cáo</button>
        </form>
      </section>
    </div>
  )
}
