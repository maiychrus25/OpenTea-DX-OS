// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import kit from '@/components/features/farmer-web/kit.module.css'
import { localDay } from '@/domain/shared/local-day'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import { clockVn, dayMonthYear, money } from '@/lib/weighing/format'
import type { LeafTicket, LeafTicketPage } from '@/lib/weighing/types'
import { HouseholdSearch, type HouseholdHit } from './HouseholdSearch'
import styles from './weighing.module.css'

const kg = (value: number | string) => Number(value).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const when = (t: LeafTicket) => `${dayMonthYear(localDay(t.weighed_at))} ${clockVn(t.weighed_at)}`

/** Ticket list for managers and accountants: filters, totals, paging and the CSV export. */
export function LeafTicketList() {
  const [date, setDate] = useState('')
  const [status, setStatus] = useState('')
  const [household, setHousehold] = useState<HouseholdHit | null>(null)
  const [page, setPage] = useState<LeafTicketPage | null>(null)
  const [error, setError] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)

  const query = (cursor?: string) => {
    const params = new URLSearchParams()
    if (date) params.set('date', date)
    if (household) params.set('household_id', household.id)
    if (status) params.set('status', status)
    if (cursor) params.set('cursor', cursor)
    return `/api/leaf-tickets?${params.toString()}`
  }

  useEffect(() => {
    setError('')
    fetchJson<LeafTicketPage>(query())
      .then(body => setPage(body))
      .catch(() => setError(LOAD_FAILED_MESSAGE))
    // query() reads the filters above; they are the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, status, household?.id])

  async function loadMore() {
    if (!page?.next_cursor) return
    setLoadingMore(true)
    try {
      const body = await fetchJson<LeafTicketPage>(query(page.next_cursor))
      setPage({ ...body, data: [...page.data, ...body.data] })
    } catch {
      setError(LOAD_FAILED_MESSAGE)
    } finally {
      setLoadingMore(false)
    }
  }

  const csvHref = date ? `/api/leaf-tickets/export.csv?from=${date}&to=${date}` : null

  return (
    <section className={kit.pn} aria-labelledby="leaf-ticket-list-title">
      <div className={kit.ph}><h2 id="leaf-ticket-list-title">Danh sách phiếu cân</h2></div>
      <div className={`${styles.filters} ${styles.pad}`}>
        <label className={kit.fl}>
          Ngày
          <input className={kit.inp} type="date" value={date} onChange={e => setDate(e.target.value)} />
        </label>
        <label className={kit.fl}>
          Trạng thái
          <select className={kit.inp} value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">Tất cả</option>
            <option value="VALID">Hợp lệ</option>
            <option value="VOIDED">Đã huỷ</option>
          </select>
        </label>
        <div className={styles.grow}>
          {household ? (
            <div className={styles.chip}>
              <span>Hộ: <strong>{household.name}</strong></span>
              <Button size="sm" variant="secondary" onClick={() => setHousehold(null)}>Bỏ lọc hộ</Button>
            </div>
          ) : (
            <HouseholdSearch label="Lọc theo hộ" onSelect={setHousehold} />
          )}
        </div>
      </div>

      {error && <p role="alert" className={`${styles.error} ${styles.pad}`}>{error}</p>}
      {page && (
        <>
          <dl className={`${styles.totals} ${styles.pad}`}>
            <div><dt>Tổng kg tịnh</dt><dd>{kg(page.totals.net_kg)} kg</dd></div>
            <div><dt>Thành tiền</dt><dd>{money(page.totals.amount_vnd)} đ</dd></div>
          </dl>
          <div className={`${styles.csvRow} ${styles.pad}`}>
            {csvHref
              ? <a className={styles.link} href={csvHref} download>Tải CSV của ngày đã chọn</a>
              : <span className={kit.muted}>Chọn ngày để tải CSV.</span>}
          </div>
          {page.data.length === 0 ? (
            <p className={`${kit.muted} ${styles.pad}`}>Không có phiếu nào theo bộ lọc này.</p>
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Số phiếu</th><th>Ngày cân</th><th>Hộ</th><th>Nương</th><th>Phẩm cấp</th><th>Kg tịnh</th><th>Thành tiền</th><th>Trạng thái</th></tr>
                </thead>
                <tbody>
                  {page.data.map(t => (
                    <tr key={t.id}>
                      <td>{t.ticket_no}</td>
                      <td>{when(t)}</td>
                      <td>{t.household_name}</td>
                      <td>{t.parcel_code}</td>
                      <td>{t.grade_name}</td>
                      <td>{kg(t.net_kg)} kg</td>
                      <td>{money(t.amount_vnd)} đ</td>
                      <td><span className={kit.tag}>{t.status === 'VOIDED' ? 'Đã huỷ' : 'Hợp lệ'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {page.next_cursor && (
            <div className={`${styles.pad} ${styles.center}`}>
              <Button variant="secondary" isLoading={loadingMore} onClick={loadMore}>Tải thêm</Button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
