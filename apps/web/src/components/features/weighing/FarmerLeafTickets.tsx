// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import { Receipt } from 'lucide-react'
import kit from '@/components/features/farmer-web/kit.module.css'
import { localDay } from '@/domain/shared/local-day'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import { clockVn, dayMonthYear, money } from '@/lib/weighing/format'
import type { LeafTicket } from '@/lib/weighing/types'
import styles from './weighing.module.css'

const kg = (value: number | string) => Number(value).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** The farmer's own weighing tickets, newest first as the server returns them. */
export function FarmerLeafTickets() {
  const [tickets, setTickets] = useState<LeafTicket[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchJson<{ data: LeafTicket[] }>('/api/leaf-tickets/mine')
      .then(body => setTickets(body.data))
      .catch(() => setError(LOAD_FAILED_MESSAGE))
  }, [])

  return (
    <div className={kit.page}>
      <div className={kit.hd}>
        <span className={kit.hico}><Receipt size={28} aria-hidden="true" /></span>
        <div className={kit.hdText}>
          <h1 className={kit.h1}>Phiếu cân của tôi</h1>
          <p className={kit.sub}>Phiếu cân búp tươi của hộ bạn tại HTX.</p>
        </div>
      </div>
      <section className={kit.pn} aria-label="Danh sách phiếu cân">
        {error && <p role="alert" className={`${styles.error} ${styles.pad}`}>{error}</p>}
        {!error && tickets === null && <p className={`${kit.muted} ${styles.pad}`}>Đang tải...</p>}
        {tickets?.length === 0 && <p className={`${kit.muted} ${styles.pad}`}>Bạn chưa có phiếu cân nào.</p>}
        {tickets && tickets.length > 0 && (
          <ul className={kit.list}>
            {tickets.map(t => (
              <li key={t.id} className={styles.ticketRow}>
                <div className={styles.grow}>
                  <strong>{t.ticket_no}</strong>
                  <span className={kit.muted}>{dayMonthYear(localDay(t.weighed_at))} {clockVn(t.weighed_at)} · {t.parcel_code}</span>
                  <span>{kg(t.net_kg)} kg · {money(t.amount_vnd)} đ</span>
                </div>
                <span className={kit.tag}>{t.status === 'VOIDED' ? 'Đã huỷ' : 'Hợp lệ'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
