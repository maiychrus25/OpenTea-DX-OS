// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { BoardBlock } from './BoardBlock'
import styles from './board.module.css'

/** Block 5: wholesale receivables. Sales come in sub-project S8, so until then the block says there are no orders. */
export function ReceivablesBlock() {
  return (
    <BoardBlock title="Thương lái còn nợ">
      <p className={styles.bigValue}>Chưa có đơn bán sỉ</p>
      <p className={styles.muted}>Có ở bước Bán hàng.</p>
    </BoardBlock>
  )
}
