// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import Link from 'next/link'
import React from 'react'
import { MONEY_ALERTS, type BoardAlert } from '@/domain/board/views'
import { BoardBlock } from './BoardBlock'
import styles from './board.module.css'

interface Props {
  alerts: BoardAlert[] | null
  role: 'manager' | 'accountant'
}

/** Accountant pages that exist; any other manager link falls back to the accountant's board. */
const ACCOUNTANT_PAGES = ['/settlements', '/leaf-tickets', '/inputs', '/weighing']

function accountantHref(href: string): string {
  for (const page of ACCOUNTANT_PAGES) {
    const managerPath = `/manager${page}`
    if (href === managerPath || href.startsWith(`${managerPath}/`)) return `/accountant${page}${href.slice(managerPath.length)}`
  }
  return href.startsWith('/manager') ? '/accountant/dashboard' : href
}

/** The accountant gets only the money alerts, and a link never leaves the accountant's area. */
function forRole(alert: BoardAlert, role: Props['role']): BoardAlert {
  return role === 'manager' ? alert : { ...alert, href: accountantHref(alert.href) }
}

/** Block 6: red alerts with a link to each. Only the kinds with a count appear; an empty list reads as all clear. */
export function AlertsBlock({ alerts, role }: Props) {
  const visible = alerts?.filter(a => role === 'manager' || MONEY_ALERTS.includes(a.kind)).map(a => forRole(a, role)) ?? null
  return (
    <BoardBlock title="Có gì đỏ" failedText={visible ? undefined : 'Chưa tải được cảnh báo.'}>
      {visible && visible.length === 0 && <p className={styles.allClear}>Không có cảnh báo</p>}
      {visible && visible.length > 0 && (
        <ul className={styles.alertList}>
          {visible.map(a => (
            <li key={a.kind} className={styles.alertItem}>
              <Link href={a.href} className={styles.alertLink}>{a.message}</Link>
            </li>
          ))}
        </ul>
      )}
    </BoardBlock>
  )
}
