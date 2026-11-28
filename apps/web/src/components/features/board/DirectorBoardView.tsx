// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import type { DirectorBoard } from '@/domain/board/views'
import { AlertsBlock } from './AlertsBlock'
import { DryStockBlock } from './DryStockBlock'
import { LeafBlock } from './LeafBlock'
import { PayableBlock } from './PayableBlock'
import { PricesBlock } from './PricesBlock'
import { ReceivablesBlock } from './ReceivablesBlock'
import styles from './board.module.css'

interface Props {
  board: DirectorBoard
  role: 'manager' | 'accountant'
}

/**
 * The morning board. The manager sees the six blocks in the order of the spec's table; the accountant sees the money
 * part (blocks 1 to 3) and the money alerts. Each block shows its own error state when its value is null.
 */
export function DirectorBoardView({ board, role }: Props) {
  const base = role === 'manager' ? '/manager' : '/accountant'
  return (
    <div className={styles.grid} data-testid="director-board">
      <LeafBlock leaf={board.leaf} base={base} />
      <PricesBlock prices={board.prices} canPublish={role === 'manager'} />
      <PayableBlock payable={board.payable} base={base} />
      {role === 'manager' && <DryStockBlock stock={board.dry_stock} />}
      <ReceivablesBlock receivables={board.receivables} base={base} />
      <AlertsBlock alerts={board.alerts} role={role} />
    </div>
  )
}
