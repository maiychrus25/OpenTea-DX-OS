// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import Link from 'next/link'
import React from 'react'
import type { PricesToday } from '@/domain/board/views'
import { BoardBlock } from './BoardBlock'
import { pricePerKg } from './format'
import styles from './board.module.css'

interface Props {
  prices: PricesToday | null
  /** Only the manager publishes prices; the accountant reads them. */
  canPublish: boolean
}

/** Block 2: today's price per grade, or the publish button when today is not published yet. */
export function PricesBlock({ prices, canPublish }: Props) {
  return (
    <BoardBlock title="Giá thu mua hôm nay" failedText={prices ? undefined : 'Chưa tải được giá thu mua.'}>
      {prices && (prices.published ? (
        <ul className={styles.list}>
          {prices.grades.map(g => (
            <li key={g.grade_id} className={styles.row}>
              <span>{g.grade_name}</span>
              <strong>{pricePerKg(g.price_vnd_per_kg)}</strong>
            </li>
          ))}
        </ul>
      ) : canPublish ? (
        <>
          <p className={styles.muted}>Chưa công bố giá hôm nay.</p>
          <Link href="/manager/leaf-prices" className={styles.primaryButton}>Công bố giá hôm nay</Link>
        </>
      ) : (
        <p className={styles.muted}>Chưa công bố giá hôm nay.</p>
      ))}
    </BoardBlock>
  )
}
