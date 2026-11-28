// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import kit from '@/components/features/farmer-web/kit.module.css'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import { formatVnd } from '@/lib/ledger/money'
import type { LedgerMine } from '@/lib/ledger/types'
import { dayMonthYear } from '@/lib/weighing/format'
import { localDay } from '@/domain/shared/local-day'
import { balanceText } from './FarmerLedger'
import styles from './ledger.module.css'

/** The farmer's dashboard view of the money book: the balance and the last weigh tickets not yet settled. */
export function FarmerMoneyCard() {
  const [ledger, setLedger] = useState<LedgerMine | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchJson<{ data: LedgerMine }>('/api/ledger/mine')
      .then(body => (typeof body.data?.balance_vnd === 'string' ? setLedger(body.data) : setError(LOAD_FAILED_MESSAGE)))
      .catch(() => setError(LOAD_FAILED_MESSAGE))
  }, [])

  const tickets = (ledger?.unsettled_tickets ?? []).filter(t => t.status !== 'VOIDED').slice(0, 3)

  return (
    <section className={kit.pn} aria-labelledby="farmer-money-title">
      <div className={kit.ph}>
        <h2 id="farmer-money-title">Tiền búp của tôi</h2>
        <Link href="/farmer/ledger" className={styles.moneyHead}>Xem sổ tiền <ArrowRight size={14} aria-hidden="true" /></Link>
      </div>
      {error && <p role="alert" className={`${styles.error} ${styles.pad}`}>{error}</p>}
      {!error && !ledger && <p className={`${kit.muted} ${styles.pad}`}>Đang tải...</p>}
      {ledger && (
        <>
          <p className={styles.moneyBalance}>{balanceText(ledger.balance_vnd)}</p>
          {tickets.length === 0
            ? <p className={`${kit.muted} ${styles.pad}`}>Chưa có phiếu cân nào chờ quyết toán.</p>
            : (
              <ul className={`${kit.list} ${styles.moneyTickets}`} aria-label="Phiếu cân gần nhất">
                {tickets.map(t => (
                  <li key={t.id}>
                    <span>{dayMonthYear(localDay(t.weighed_at)).slice(0, 5)} · {t.grade_name}</span>
                    <span>{Number(t.net_kg).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg</span>
                    <strong>{formatVnd(t.amount_vnd)} đ</strong>
                  </li>
                ))}
              </ul>
            )}
        </>
      )}
    </section>
  )
}
