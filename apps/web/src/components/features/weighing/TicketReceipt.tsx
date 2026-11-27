// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import kit from '@/components/features/farmer-web/kit.module.css'
import { localDay } from '@/domain/shared/local-day'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import { clockVn, dayMonthYear, money } from '@/lib/weighing/format'
import type { LeafTicket } from '@/lib/weighing/types'
import styles from './weighing.module.css'

const kg = (value: number | string) => Number(value).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** The 80 mm receipt; only this block prints (see the @media print rules in weighing.module.css). */
export function TicketReceipt({ id }: { id: string }) {
  const [ticket, setTicket] = useState<LeafTicket | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchJson<{ data: LeafTicket }>(`/api/leaf-tickets/${id}`)
      .then(body => setTicket(body.data))
      .catch(() => setError(LOAD_FAILED_MESSAGE))
  }, [id])

  if (error) return <p role="alert" className={styles.error}>{error}</p>
  if (!ticket) return <p className={kit.muted}>Đang tải phiếu...</p>

  return (
    <div className={styles.printShell}>
      <div className={`${styles.receipt} ${styles.printArea}`}>
        <h1 className={styles.receiptTitle}>Biên nhận búp tươi</h1>
        <p className={styles.receiptCenter}>{ticket.ticket_no}</p>
        <p className={styles.receiptCenter}>{dayMonthYear(localDay(ticket.weighed_at))} {clockVn(ticket.weighed_at)}</p>
        <dl className={styles.receiptRows}>
          <div><dt>Hộ</dt><dd>{ticket.household_name}</dd></div>
          <div><dt>Nương</dt><dd>{ticket.parcel_code}</dd></div>
          <div><dt>Phẩm cấp</dt><dd>{ticket.grade_name}</dd></div>
          <div><dt>Kg cân</dt><dd>{kg(ticket.gross_kg)} kg</dd></div>
          <div><dt>Trừ</dt><dd>{kg(ticket.deduction_pct)}%</dd></div>
          <div><dt>Kg tịnh</dt><dd>{kg(ticket.net_kg)} kg</dd></div>
          <div><dt>Giá</dt><dd>{money(ticket.price_vnd_per_kg)} đ/kg</dd></div>
          <div><dt>Thành tiền</dt><dd>{money(ticket.amount_vnd)} đ</dd></div>
        </dl>
        {ticket.status === 'VOIDED' && <p className={styles.receiptCenter}>ĐÃ HUỶ: {ticket.void_reason}</p>}
      </div>
      <div className={styles.printActions}>
        <Button size="lg" onClick={() => window.print()}>In biên nhận</Button>
      </div>
    </div>
  )
}
