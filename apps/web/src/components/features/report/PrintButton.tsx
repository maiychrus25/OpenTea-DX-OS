// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React from 'react'
import styles from './report.module.css'

/** Opens the browser's print dialog; the A4 layout comes from the @media print rules in report.module.css. */
export function PrintButton() {
  return (
    <button type="button" className={styles.printButton} onClick={() => window.print()}>In báo cáo</button>
  )
}
