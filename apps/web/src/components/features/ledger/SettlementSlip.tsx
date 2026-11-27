// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import kit from '@/components/features/farmer-web/kit.module.css'
import { localDay } from '@/domain/shared/local-day'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import { formatVnd } from '@/lib/ledger/money'
import type { SettlementSlip as Slip } from '@/lib/ledger/types'
import { dayMonthYear } from '@/lib/weighing/format'
import styles from './ledger.module.css'

const kg = (value: number | string) => Number(value).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

interface Props {
  periodId: string
  lineId: string
  /** Where the back link goes. */
  backHref: string
}

/** The A5 settlement slip of one household; prints alone through the @media print rules in ledger.module.css. */
export function SettlementSlip({ periodId, lineId, backHref }: Props) {
  const [slip, setSlip] = useState<Slip | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchJson<{ data: Slip }>(`/api/settlements/${periodId}/lines/${lineId}/slip`)
      .then(body => setSlip(body.data))
      .catch(() => setError(LOAD_FAILED_MESSAGE))
  }, [periodId, lineId])

  if (error) return <p role="alert" className={styles.error}>{error}</p>
  if (!slip) return <p className={kit.muted}>Đang tải phiếu...</p>

  const { htx, household, period, tickets, advances, line, qr, transfer_note: note } = slip

  return (
    <div className={styles.printShell}>
      <article className={`${styles.slip} ${styles.printArea}`} aria-label={`Phiếu quyết toán ${household.name}`}>
        <header className={styles.slipHead}>
          <h1 className={styles.slipTitle}>Phiếu quyết toán</h1>
          <p className={styles.slipCenter}>{htx.name}</p>
          <p className={styles.slipCenter}>Kỳ {period.code}: {dayMonthYear(period.date_from)} – {dayMonthYear(period.date_to)}</p>
          <p><strong>Hộ:</strong> {household.name}</p>
        </header>

        <h2 className={styles.slipSection}>Phiếu cân</h2>
        {tickets.length === 0 ? <p className={styles.slipNote}>Không có phiếu cân trong kỳ.</p> : (
          <table className={styles.slipTable}>
            <thead><tr><th>Số phiếu</th><th>Ngày</th><th>Kg tịnh</th><th>Thành tiền</th></tr></thead>
            <tbody>
              {tickets.map(t => (
                <tr key={t.id}><td>{t.ticket_no}</td><td>{dayMonthYear(localDay(t.weighed_at))}</td><td>{kg(t.net_kg)}</td><td>{formatVnd(t.amount_vnd)}</td></tr>
              ))}
            </tbody>
          </table>
        )}

        <h2 className={styles.slipSection}>Vật tư ứng</h2>
        {advances.length === 0 ? <p className={styles.slipNote}>Không có vật tư ứng trong kỳ.</p> : (
          <table className={styles.slipTable}>
            <thead><tr><th>Số phiếu</th><th>Vật tư</th><th>Số lượng</th><th>Thành tiền</th></tr></thead>
            <tbody>
              {advances.map(a => (
                <tr key={a.id}><td>{a.advance_no}</td><td>{a.item_name}</td><td>{String(a.quantity)} {a.unit}</td><td>{formatVnd(a.amount_vnd)}</td></tr>
              ))}
            </tbody>
          </table>
        )}

        <dl className={styles.slipSummary}>
          <div><dt>Tiền búp</dt><dd>{formatVnd(line.leaf_amount_vnd)} đ</dd></div>
          <div><dt>Vật tư ứng</dt><dd>{formatVnd(line.advances_vnd)} đ</dd></div>
          <div><dt>Nợ kỳ trước</dt><dd>{formatVnd(line.debt_in_vnd)} đ</dd></div>
          <div><dt>Nợ chuyển sang kỳ sau</dt><dd>{formatVnd(line.debt_out_vnd)} đ</dd></div>
        </dl>
        <p className={styles.slipPayable}>Thực lĩnh: <strong>{formatVnd(line.payable_vnd)} đ</strong></p>

        <section className={styles.slipPayment} aria-label="Thanh toán">
          {qr ? (
            <>
              {/* The QR image is a data URL generated on the server; next/image cannot optimise it. Its alt names the amount. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.qr} src={qr.data_url} alt={`Mã VietQR chuyển ${formatVnd(line.payable_vnd)} đ`} />
              <p>Ngân hàng: {qr.bank_name}</p>
              <p>Số tài khoản: {qr.account_full ?? qr.account_masked}</p>
              <p>Nội dung chuyển khoản: {note}</p>
            </>
          ) : (
            <p>Trả tiền mặt</p>
          )}
        </section>

        <footer className={styles.slipSignatures}>
          <div><span>Người nhận</span></div>
          <div><span>Kế toán</span></div>
        </footer>
      </article>

      <div className={styles.printActions}>
        <Link href={backHref} className={styles.link}>Quay lại</Link>
        <Button size="lg" onClick={() => window.print()}>In phiếu</Button>
      </div>
    </div>
  )
}
