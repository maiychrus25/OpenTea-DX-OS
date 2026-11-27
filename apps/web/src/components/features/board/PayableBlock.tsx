// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import type { MemberPayable } from '@/domain/board/views'
import { formatVnd } from '@/lib/ledger/money'
import { BoardBlock } from './BoardBlock'
import styles from './board.module.css'

interface Props {
  payable: MemberPayable | null
  base: '/manager' | '/accountant'
}

/** Block 3: what the cooperative owes members, in three parts and the total. */
export function PayableBlock({ payable, base }: Props) {
  return (
    <BoardBlock title="Phải trả xã viên" href={`${base}/settlements`} failedText={payable ? undefined : 'Chưa tải được số tiền phải trả.'}>
      {payable && (
        <>
          <p className={styles.bigValue}>{formatVnd(payable.total_vnd)} đ</p>
          <ul className={styles.list}>
            <li className={styles.row}><span>Quyết toán đã chốt, chưa trả</span><strong>{formatVnd(payable.unpaid_lines_vnd)} đ</strong></li>
            <li className={styles.row}><span>Phiếu cân chưa quyết toán</span><strong>+ {formatVnd(payable.unsettled_leaf_vnd)} đ</strong></li>
            <li className={styles.row}><span>Vật tư ứng chưa quyết toán</span><strong>− {formatVnd(payable.unsettled_advances_vnd)} đ</strong></li>
          </ul>
        </>
      )}
    </BoardBlock>
  )
}
