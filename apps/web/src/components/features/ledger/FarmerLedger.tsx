// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import { ListenButton } from '@/components/features/tts/ListenButton'
import { balanceSentence } from '@/lib/tts/sentences'
import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import { FileText, Package, Scale, Wallet } from 'lucide-react'
import kit from '@/components/features/farmer-web/kit.module.css'
import { localDay } from '@/domain/shared/local-day'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import { formatVnd } from '@/lib/ledger/money'
import type { LedgerMine } from '@/lib/ledger/types'
import { dayMonthYear, clockVn, money } from '@/lib/weighing/format'
import styles from './ledger.module.css'

const kg = (value: number) => value.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const ENTRY_LABELS = { LEAF_CREDIT: 'Tiền búp', INPUT_DEBIT: 'Trừ vật tư', PAYOUT: 'HTX đã trả', ADJUSTMENT: 'Điều chỉnh' } as const
const HISTORY_SHORT = 8
const signedVnd = (value: string) => {
  const amount = BigInt(value)
  return `${amount < BigInt(0) ? '−' : '+'}${formatVnd(amount < BigInt(0) ? -amount : amount)} đ`
}
const sumVnd = (rows: { amount_vnd: string; status: string }[]) =>
  rows.reduce((total, r) => (r.status === 'VOIDED' ? total : total + BigInt(r.amount_vnd)), BigInt(0)).toString()

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
  const [allHistory, setAllHistory] = useState(false)

  useEffect(() => {
    fetchJson<{ data: LedgerMine }>('/api/ledger/mine')
      .then(body => setLedger(body.data))
      .catch(() => setError(LOAD_FAILED_MESSAGE))
  }, [])

  if (error) return <p role="alert" className={styles.error}>{error}</p>
  if (!ledger) return <p className={kit.muted}>Đang tải sổ tiền...</p>

  const { unsettled_tickets: tickets, unsettled_advances: advances, lines, entries } = ledger
  // Voided tickets stay listed but are left out of every total.
  const valid = tickets.filter(t => t.status !== 'VOIDED')
  const totalKg = kg(valid.reduce((total, t) => total + Number(t.net_kg), 0))
  const validAdvances = advances.filter(a => a.status !== 'VOIDED')
  const summaries = [
    { icon: Scale, label: 'Phiếu cân', count: valid.length, detail: `${totalKg} kg` },
    { icon: Package, label: 'Vật tư ứng', count: validAdvances.length, detail: `${formatVnd(sumVnd(advances))} đ` },
    { icon: FileText, label: 'Quyết toán', count: lines.length, detail: 'kỳ quyết toán' },
  ]

  return (
    <div className={`${kit.page} ${styles.farmerLedger}`}>
      <div className={kit.hd}>
        <span className={kit.hico}><Wallet size={28} aria-hidden="true" /></span>
        <div className={kit.hdText}>
          <h1 className={kit.h1}>Sổ tiền</h1>
          <p className={kit.sub}>Theo dõi phiếu cân, vật tư ứng và quyết toán của hộ.</p>
        </div>
      </div>

      <section className={`${kit.pn} ${styles.balance} ${styles.balanceHero}`} aria-label="Số dư">
        <div className={styles.grow}>
          <p className={styles.balanceLine}>{balanceText(ledger.balance_vnd)}</p>
          <ListenButton text={balanceSentence(balanceText(ledger.balance_vnd))} label="Nghe số dư" />
          {ledger.households.length > 1 && (
            <ul className={styles.householdBalances} aria-label="Số dư từng hộ">
              {ledger.households.map(h => (
                <li key={h.household_id}><strong>{h.household_name}:</strong> {balanceText(h.balance_vnd)}</li>
              ))}
            </ul>
          )}
        </div>
        <span className={`${kit.hico} ${styles.balanceIcon}`}><Wallet size={28} aria-hidden="true" /></span>
      </section>

      <ul className={styles.summaries} aria-label="Tổng hợp chưa quyết toán và các kỳ">
        {summaries.map(({ icon: Icon, label, count, detail }) => (
          <li key={label} className={`${kit.pn} ${styles.summary}`}>
            <span className={`${kit.ico} ${kit.soft}`}><Icon size={20} aria-hidden="true" /></span>
            <span><small>{label}</small><strong>{count}</strong><small>{detail}</small></span>
          </li>
        ))}
      </ul>

      <div className={styles.ledgerColumns}>
        <section className={kit.pn} aria-labelledby="ledger-tickets">
          <div className={kit.ph}><h2 id="ledger-tickets">Phiếu cân</h2></div>
          {tickets.length === 0
            ? <p className={`${kit.muted} ${styles.pad}`}>Chưa có phiếu cân nào chờ quyết toán.</p>
            : (
              <table className={`${styles.table} ${styles.farmerTickets}`} aria-label="Phiếu cân">
                <colgroup>
                  <col className={styles.ticketNumberColumn} />
                  <col className={styles.ticketDateColumn} />
                  <col className={styles.ticketParcelColumn} />
                  <col className={styles.ticketWeightColumn} />
                  <col className={styles.ticketAmountColumn} />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Số phiếu</th>
                    <th scope="col">Ngày giờ</th>
                    <th scope="col">Thửa</th>
                    <th scope="col" className={styles.ticketNumeric}>Kg</th>
                    <th scope="col" className={styles.ticketNumeric}>Thành tiền</th>
                  </tr>
                </thead>
                  <tbody>
                    {ledger.unsettled_tickets.map(t => (
                      <tr key={t.id}>
                        <td>
                          <strong>{t.ticket_no}</strong>
                          <span className={t.status === 'VOIDED' ? styles.error : kit.muted}>
                            {t.status === 'VOIDED' ? 'Đã huỷ' : 'Hợp lệ'}
                          </span>
                          {t.status === 'VOIDED' && t.void_reason && <span className={kit.muted}>{t.void_reason}</span>}
                        </td>
                        <td><time dateTime={t.weighed_at}>{dayMonthYear(localDay(t.weighed_at))}{' '}<span className={kit.muted}>{clockVn(t.weighed_at)}</span></time></td>
                        <td>{t.parcel_code}<span className={kit.muted}>{t.grade_name}</span></td>
                        <td className={styles.ticketNumeric}>{kg(Number(t.net_kg))}<span className={kit.muted}>Gộp {kg(Number(t.gross_kg))}</span><span className={kit.muted}>Trừ {Number(t.deduction_pct).toLocaleString('vi-VN')}%</span></td>
                        <td className={styles.ticketNumeric}>{formatVnd(t.amount_vnd)} đ<span className={kit.muted}>{money(t.price_vnd_per_kg)} đ/kg</span></td>
                      </tr>
                    ))}
                  </tbody>
              </table>
            )}
          {valid.length > 0 && (
            <p className={styles.ticketTotal}><span>Tổng {totalKg} kg</span><strong>{formatVnd(sumVnd(tickets))} đ</strong></p>
          )}
        </section>

        <div className={styles.ledgerSide}>
          <section className={kit.pn} aria-labelledby="ledger-advances">
            <div className={kit.ph}><h2 id="ledger-advances">Vật tư ứng</h2></div>
            {advances.length === 0
              ? <p className={`${kit.muted} ${styles.pad}`}>Chưa có vật tư ứng nào chờ quyết toán.</p>
              : (
                <ul className={kit.list}>
                  {advances.map(a => (
                    <li key={a.id} className={styles.row}>
                      <div className={styles.grow}>
                        <strong>{a.item_name} · {String(a.quantity)} {a.unit}</strong>
                        <span className={kit.muted}>{a.advance_no}</span>
                      </div>
                      <strong>{formatVnd(a.amount_vnd)} đ</strong>
                    </li>
                  ))}
                </ul>
              )}
          </section>

          <section className={kit.pn} aria-labelledby="ledger-settlements">
            <div className={kit.ph}><h2 id="ledger-settlements">Quyết toán</h2></div>
            {lines.length === 0
              ? <p className={`${kit.muted} ${styles.pad}`}>Chưa có kỳ quyết toán nào.</p>
              : (
                <ul className={kit.list}>
                  {lines.map(line => (
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
              )}
          </section>
        </div>
      </div>

      <section className={kit.pn} aria-labelledby="ledger-history">
        <div className={kit.ph}><h2 id="ledger-history">Lịch sử ghi sổ</h2></div>
        {entries.length === 0
          ? <p className={`${kit.muted} ${styles.pad}`}>Chưa có dòng nào trong sổ.</p>
          : (
            <ul className={`${kit.list} ${styles.history}`} aria-label="Lịch sử ghi sổ">
              {(allHistory ? entries : entries.slice(0, HISTORY_SHORT)).map(e => (
                <li key={e.id}>
                  <time dateTime={e.created_at}>{dayMonthYear(localDay(e.created_at))}</time>
                  <span><strong>{ENTRY_LABELS[e.entry_type] ?? e.entry_type}</strong>{e.note && <small className={kit.muted}>{e.note}</small>}</span>
                  <b className={e.amount_vnd.startsWith('-') ? styles.minus : styles.plus}>{signedVnd(e.amount_vnd)}</b>
                </li>
              ))}
            </ul>
          )}
        {!allHistory && entries.length > HISTORY_SHORT && (
          <div className={styles.pad}><button type="button" className={kit.btn2} onClick={() => setAllHistory(true)}>Xem tất cả {entries.length} dòng</button></div>
        )}
      </section>
    </div>
  )
}
