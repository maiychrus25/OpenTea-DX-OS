// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import Link from 'next/link'
import React from 'react'
import type { SeasonReport } from '@/domain/report/views'
import { dayMonthYear } from '@/lib/weighing/format'
import { PrintButton } from './PrintButton'
import { ReportSections } from './ReportSections'
import styles from './report.module.css'

interface Props {
  report: SeasonReport
  /** The picker page, for the back link. */
  pickerHref: string
}

/** The season report on screen and on A4 paper: header, the seven sections, and the signature row. */
export function ReportView({ report, pickerHref }: Props) {
  const generated = new Date(report.generated_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
  return (
    <>
      <div className={styles.reportHead}>
        <Link href={pickerHref} className={styles.link}>← Chọn kỳ khác</Link>
        <PrintButton />
      </div>
      <article className={styles.printArea} aria-label="Báo cáo vụ năm">
        <header className={styles.printHeader}>
          <h1 className={styles.printTitle}>Báo cáo vụ / năm</h1>
          <p><strong>{report.htx_name || 'Hợp tác xã'}</strong></p>
          <p>Kỳ báo cáo: {dayMonthYear(report.from)} – {dayMonthYear(report.to)}</p>
          <p className={styles.muted}>Lập lúc {generated}</p>
        </header>
        <ReportSections report={report} from={report.from} to={report.to} />
        <div className={styles.signRow}>
          <span>Chủ tịch HĐQT</span>
          <span>Kế toán</span>
        </div>
      </article>
    </>
  )
}
