// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import { ListenButton } from '@/components/features/tts/ListenButton'
import { balanceSentence } from '@/lib/tts/sentences'
import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import { Wallet } from 'lucide-react'
import kit from '@/components/features/farmer-web/kit.module.css'
import { localDay } from '@/domain/shared/local-day'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import { formatVnd } from '@/lib/ledger/money'
import type { LedgerMine } from '@/lib/ledger/types'
import { dayMonthYear, clockVn } from '@/lib/weighing/format'
import styles from './ledger.module.css'

type TabId = 'tickets' | 'advances' | 'settlements'
const TABS: { id: TabId; label: string }[] = [
  { id: 'tickets', label: 'Phiếu cân' },
  { id: 'advances', label: 'Vật tư ứng' },
  { id: 'settlements', label: 'Quyết toán' },
]

/** The balance sentence: positive means the HTX owes the farmer. */
export function balanceText(balanceVnd: string): string {
  const value = BigInt(balanceVnd)
  if (value === BigInt(0)) return 'Số dư 0 đ'
  const amount = formatVnd(value < BigInt(0) ? -value : value)
  return value > BigInt(0) ? `HTX đang nợ bạn ${amount} đ` : `Bạn đang nợ HTX ${amount} đ`
}

/** "Sổ tiền": the farmer's balance, the unsettled tickets and advances, and the settlements with their slips. */
export function FarmerLedger() {
  const [ledger, setLedger] = useState<LedgerMine | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<TabId>('tickets')

  useEffect(() => {
    fetchJson<{ data: LedgerMine }>('/api/ledger/mine')
      .then(body => setLedger(body.data))
      .catch(() => setError(LOAD_FAILED_MESSAGE))
  }, [])

  /** Left and right arrows move between tabs, as the tab pattern expects. */
  function onTabKey(event: React.KeyboardEvent, index: number) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const next = TABS[(index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]
    setTab(next.id)
    document.getElementById(`ledger-tab-${next.id}`)?.focus()
  }

  if (error) return <p role="alert" className={styles.error}>{error}</p>
  if (!ledger) return <p className={kit.muted}>Đang tải sổ tiền...</p>

  return (
    <div className={kit.page}>
      <div className={kit.hd}>
        <span className={kit.hico}><Wallet size={28} aria-hidden="true" /></span>
        <div className={kit.hdText}>
          <h1 className={kit.h1}>Sổ tiền</h1>
          <p className={kit.sub}>Số dư, phiếu cân và vật tư chưa quyết toán, và các kỳ quyết toán của bạn.</p>
        </div>
      </div>

      <section className={`${kit.pn} ${styles.balance}`} aria-label="Số dư">
        <p className={styles.balanceLine}>{balanceText(ledger.balance_vnd)}</p>
        <ListenButton text={balanceSentence(balanceText(ledger.balance_vnd))} label="Nghe số dư" />
        {ledger.households.length > 1 && (
          <ul className={styles.householdBalances} aria-label="Số dư từng hộ">
            {ledger.households.map(h => (
              <li key={h.household_id}><strong>{h.household_name}:</strong> {balanceText(h.balance_vnd)}</li>
            ))}
          </ul>
        )}
      </section>

      <section className={kit.pn} aria-label="Chi tiết sổ tiền">
        <div role="tablist" aria-label="Sổ tiền" className={styles.tabs}>
          {TABS.map((t, index) => (
            <button key={t.id} id={`ledger-tab-${t.id}`} type="button" role="tab" aria-selected={tab === t.id}
              aria-controls={`ledger-panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1}
              className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
              onClick={() => setTab(t.id)} onKeyDown={e => onTabKey(e, index)}>
              {t.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`ledger-panel-${tab}`} aria-labelledby={`ledger-tab-${tab}`}>
          {tab === 'tickets' && (
            ledger.unsettled_tickets.length === 0
              ? <p className={`${kit.muted} ${styles.pad}`}>Chưa có phiếu cân nào chờ quyết toán.</p>
              : (
                <ul className={kit.list}>
                  {ledger.unsettled_tickets.map(t => (
                    <li key={t.id} className={styles.row}>
                      <div className={styles.grow}>
                        <strong>{t.ticket_no}</strong>
                        <span className={kit.muted}>{dayMonthYear(localDay(t.weighed_at))} {clockVn(t.weighed_at)} · {t.parcel_code}</span>
                        <span>{Number(t.net_kg).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg · {formatVnd(t.amount_vnd)} đ</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )
          )}

          {tab === 'advances' && (
            ledger.unsettled_advances.length === 0
              ? <p className={`${kit.muted} ${styles.pad}`}>Chưa có vật tư ứng nào chờ quyết toán.</p>
              : (
                <ul className={kit.list}>
                  {ledger.unsettled_advances.map(a => (
                    <li key={a.id} className={styles.row}>
                      <div className={styles.grow}>
                        <strong>{a.advance_no}</strong>
                        <span className={kit.muted}>{a.item_name} · {String(a.quantity)} {a.unit}</span>
                        <span>{formatVnd(a.amount_vnd)} đ</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )
          )}

          {tab === 'settlements' && (
            ledger.lines.length === 0
              ? <p className={`${kit.muted} ${styles.pad}`}>Chưa có kỳ quyết toán nào.</p>
              : (
                <ul className={kit.list}>
                  {ledger.lines.map(line => (
                    <li key={`${line.period_id}-${line.household_id}`} className={styles.row}>
                      <div className={styles.grow}>
                        <strong>{line.household_name}</strong>
                        <span className={kit.muted}>Kỳ {line.period_code} · Tiền búp {formatVnd(line.leaf_amount_vnd)} đ · Vật tư {formatVnd(line.advances_vnd)} đ</span>
                        <span>Thực lĩnh {formatVnd(line.payable_vnd)} đ · {line.paid_at ? 'Đã trả' : BigInt(line.payable_vnd) === BigInt(0) ? 'Không có khoản chi trả' : 'Chưa trả'}</span>
                      </div>
                      {line.id
                        ? <Link href={`/farmer/settlements/${line.period_id}/slip/${line.id}`} className={styles.link}>Xem phiếu</Link>
                        : <span className={kit.muted}>Phiếu chưa sẵn sàng</span>}
                    </li>
                  ))}
                </ul>
              )
          )}
        </div>
      </section>
    </div>
  )
}
