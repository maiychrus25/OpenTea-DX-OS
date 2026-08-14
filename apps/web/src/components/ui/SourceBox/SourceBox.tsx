// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { FileCheck2 } from 'lucide-react'
import styles from './SourceBox.module.css'

/**
 * SourceBox — Citation component.
 * MANDATORY: Must be rendered whenever displaying market price data,
 * bulletin data, or any data sourced from external APIs (USDA, WTO, market APIs).
 * AI Invariant compliance: Every data point must have traceable sources.
 */
interface SourceBoxProps {
  count: number
  sources: string[]
}

export function SourceBox({ count, sources }: SourceBoxProps) {
  return (
    <div className={styles.sourceBox}>
      <FileCheck2 className={styles.icon} />
      <div className={styles.content}>
        <strong className={styles.strong}>{count} nguồn đã kiểm chứng</strong>
        <span className={styles.span}>{sources.join(' · ')}</span>
      </div>
    </div>
  )
}
