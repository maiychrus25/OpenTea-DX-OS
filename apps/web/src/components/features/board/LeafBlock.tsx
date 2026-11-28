// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import type { LeafToday } from '@/domain/board/views'
import { formatVnd } from '@/lib/ledger/money'
import { BoardBlock } from './BoardBlock'
import { changeText, kgText } from './format'
import styles from './board.module.css'

interface Props {
  leaf: LeafToday | null
  base: '/manager' | '/accountant'
}

/** Block 1: fresh leaf weighed today, its value and the change against yesterday. */
export function LeafBlock({ leaf, base }: Props) {
  return (
    <BoardBlock title="Búp thu hôm nay" href={`${base}/leaf-tickets`} failedText={leaf ? undefined : 'Chưa tải được số liệu thu mua hôm nay.'}>
      {leaf && (
        <>
          <p className={styles.bigValue}>{kgText(leaf.net_kg)} kg <span className={styles.unit}>tịnh</span></p>
          <p className={styles.line}>{formatVnd(leaf.amount_vnd)} đ · {leaf.tickets.toLocaleString('vi-VN')} phiếu</p>
          <p className={styles.muted}>{changeText(leaf.net_kg, leaf.yesterday_net_kg)}</p>
        </>
      )}
    </BoardBlock>
  )
}
