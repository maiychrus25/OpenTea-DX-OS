// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { DRY_TEA_GRADE_LABELS } from '@/domain/processing/grades'
import type { DryStock } from '@/domain/board/views'
import { BoardBlock } from './BoardBlock'
import { kgText } from './format'
import styles from './board.module.css'

interface Props {
  stock: DryStock | null
}

/** Block 4: dry tea left in finished batches, per grade, all five grades. */
export function DryStockBlock({ stock }: Props) {
  return (
    <BoardBlock title="Tồn chè khô" href="/manager/processing" failedText={stock ? undefined : 'Chưa tải được tồn chè khô.'}>
      {stock && (
        <ul className={styles.list}>
          {stock.grades.map(row => (
            <li key={row.grade} className={styles.row}>
              <span>{DRY_TEA_GRADE_LABELS[row.grade]}</span>
              <strong>{kgText(row.kg)} kg</strong>
            </li>
          ))}
        </ul>
      )}
    </BoardBlock>
  )
}
