// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import type { BoardReceivables } from '@/domain/board/views'
import { formatVnd } from '@/lib/ledger/money'
import { BoardBlock } from './BoardBlock'
import styles from './board.module.css'

interface Props {
  receivables: BoardReceivables | null
  base: '/manager' | '/accountant'
}

/** Block 5: what the traders owe the cooperative on wholesale orders, the overdue part in red, and the top three. */
export function ReceivablesBlock({ receivables, base }: Props) {
  return (
    <BoardBlock title="Thương lái còn nợ" href={`${base}/sales`} failedText={receivables ? undefined : 'Chưa tải được công nợ'}>
      {receivables && (
        <>
          <p className={styles.bigValue}>{formatVnd(receivables.outstanding_vnd)} đ</p>
          <p className={receivables.overdue_count > 0 ? styles.danger : styles.muted}>
            {receivables.overdue_count.toLocaleString('vi-VN')} đơn quá hạn · {formatVnd(receivables.overdue_vnd)} đ
          </p>
          {receivables.top.length > 0 && (
            <ul className={styles.list}>
              {receivables.top.map(t => (
                <li key={t.partner_name} className={styles.row}>
                  <span>{t.partner_name}</span>
                  <strong>{formatVnd(t.outstanding_vnd)} đ</strong>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </BoardBlock>
  )
}
