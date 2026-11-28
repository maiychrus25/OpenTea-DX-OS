// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Ban, CalendarDays, Clock, Coins, Download, FileText, Leaf, Map as MapIcon, Plus, Printer, Scale, Sprout, Tag, UserRound } from 'lucide-react'
import { EmptyState, PageHeader, Pill } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { WeighingStation } from '@/components/features/weighing/WeighingStation'
import { Pager, StatCards, Tabs, pageOf } from '@/components/features/manager-web/parts'
import { DetailPanel } from '@/components/features/manager-web/DetailPanel'
import ui from '@/components/features/manager-web/kit.module.css'
import kit from '@/components/features/dashboard/page-kit.module.css'
import table from '@/components/features/dashboard/dashboard.module.css'
import { localDay } from '@/domain/shared/local-day'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import { clockVn, dayMonthYear, money } from '@/lib/weighing/format'
import type { LeafTicket, LeafTicketPage } from '@/lib/weighing/types'

type View = 'ALL' | 'VALID' | 'WAITING' | 'VOIDED'

const kg = (value: number | string) => Number(value).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const when = (t: LeafTicket) => `${dayMonthYear(localDay(t.weighed_at))} ${clockVn(t.weighed_at)}`
const status = (t: LeafTicket) => (t.status === 'VOIDED' ? <Pill tone="red">Đã hủy</Pill> : <Pill tone="green">Đã xác nhận</Pill>)
/** The most pages read for one day; a cooperative's day is far below this. */
const MAX_PAGES = 20

/** The number without the cooperative's code, which every row would repeat. */
const shortNo = (no: string) => no.slice(no.indexOf('PC-') < 0 ? 0 : no.indexOf('PC-'))

/** One day's weigh tickets with the chosen one beside the list. */
export function HeadTickets() {
  const [date, setDate] = useState(() => localDay(new Date()))
  const [data, setData] = useState<LeafTicketPage | null>(null)
  const [failed, setFailed] = useState(false)
  const [view, setView] = useState<View>('ALL')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [chosenId, setChosenId] = useState('')
  const [creating, setCreating] = useState(false)
  const [voiding, setVoiding] = useState<LeafTicket | null>(null)
  const [reason, setReason] = useState('')
  const [voidError, setVoidError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const url = (cursor?: string) => `/api/leaf-tickets?${new URLSearchParams({ ...(date && { date }), ...(cursor && { cursor }) })}`
      let body = await fetchJson<LeafTicketPage>(url())
      let rows = body.data
      for (let i = 1; body.next_cursor && i < MAX_PAGES; i++) {
        body = await fetchJson<LeafTicketPage>(url(body.next_cursor))
        rows = [...rows, ...body.data]
      }
      setData({ ...body, data: rows })
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [date])
  useEffect(() => { void load() }, [load])

  const all = data?.data ?? []
  const needle = search.trim().toLocaleLowerCase('vi')
  const inView = (t: LeafTicket) => view === 'ALL' || t.status === view
  const listed = all.filter((t) => inView(t) && (!needle || `${t.ticket_no} ${t.household_name} ${t.parcel_code}`.toLocaleLowerCase('vi').includes(needle)))
  const paged = pageOf(listed, page, 8)
  const chosen = listed.find((t) => t.id === chosenId) ?? paged.rows[0] ?? null
  const count = (key: 'VALID' | 'VOIDED') => all.filter((t) => t.status === key).length

  async function confirmVoid(event: React.FormEvent) {
    event.preventDefault()
    if (!voiding) return
    setBusy(true)
    setVoidError('')
    try {
      const res = await fetch(`/api/leaf-tickets/${voiding.id}/void`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setVoidError(json?.error?.message || 'Không huỷ được phiếu.'); return }
      setVoiding(null)
      void load()
    } catch {
      setVoidError('Lỗi kết nối máy chủ.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={kit.page}>
      <PageHeader
        icon={<Scale size={28} />}
        title="Phiếu cân"
        description="Quản lý phiếu cân búp chè, khối lượng và thành tiền của xã viên."
        actions={
          <>
            <button type="button" className={kit.primary} onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" />Tạo phiếu cân</button>
            {date && all.length > 0
              ? <a className={kit.secondary} href={`/api/leaf-tickets/export.csv?from=${date}&to=${date}`} download><Download size={16} aria-hidden="true" />Xuất</a>
              : <button type="button" className={kit.secondary} disabled><Download size={16} aria-hidden="true" />Xuất</button>}
          </>
        }
      />

      <StatCards items={[
        { label: date === localDay(new Date()) ? 'Số phiếu hôm nay' : 'Số phiếu', value: `${all.length} phiếu`, icon: <FileText size={26} /> },
        { label: 'Tổng khối lượng', value: `${kg(data?.totals.net_kg ?? 0)} kg`, icon: <Sprout size={26} /> },
        { label: 'Tổng thành tiền', value: `${money(data?.totals.amount_vnd ?? '0')} đ`, icon: <Coins size={26} /> },
        { label: 'Chờ xác nhận', value: '2 phiếu', icon: <Clock size={26} />, tone: 'amber', sample: true },
      ]} />

      <div className={ui.bar}>
        <Tabs<View>
          label="Trạng thái"
          value={view}
          onChange={(key) => { setView(key); setPage(1) }}
          items={[
            { key: 'ALL', label: `Tất cả (${all.length})` },
            { key: 'VALID', label: `Đã xác nhận (${count('VALID')})` },
            { key: 'WAITING', label: 'Chờ xác nhận (Mẫu)' },
            { key: 'VOIDED', label: `Đã hủy (${count('VOIDED')})` },
          ]}
        />
        <input type="search" className={`${ui.control} ${ui.grow}`} aria-label="Tìm phiếu" placeholder="Tìm số phiếu, xã viên..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
        <input type="date" className={ui.control} aria-label="Ngày cân" value={date} onChange={(e) => { setDate(e.target.value); setPage(1) }} />
      </div>

      <div className={chosen ? ui.split : undefined}>
        <section className={kit.card} aria-label="Danh sách phiếu cân">
          {failed ? <div className={kit.state}>{LOAD_FAILED_MESSAGE}</div> : !data ? <div className={kit.state}>Đang tải...</div> : listed.length === 0 ? (
            <EmptyState icon={<Scale />} title={view === 'WAITING' ? 'Phiếu cân chưa có bước chờ xác nhận.' : 'Không có phiếu nào theo bộ lọc này.'} />
          ) : (
            <>
              <div className={table.tableWrap}>
                <table className={table.table}>
                  <thead>
                    <tr><th>#</th><th>Số phiếu</th><th>Xã viên</th><th>Thửa</th><th>Loại búp</th><th className={ui.num}>Khối lượng (kg)</th><th className={ui.num}>Đơn giá (đ/kg)</th><th className={ui.num}>Thành tiền (đ)</th><th>Trạng thái</th></tr>
                  </thead>
                  <tbody className={ui.rows}>
                    {paged.rows.map((t, index) => (
                      <tr key={t.id} aria-selected={t.id === chosen?.id} onClick={() => setChosenId(t.id)}>
                        <td>{paged.start + index + 1}</td>
                        <td><button type="button" className={ui.link} title={t.ticket_no} onClick={() => setChosenId(t.id)}>{shortNo(t.ticket_no)}</button></td>
                        <td>{t.household_name}</td>
                        <td>{t.parcel_code}</td>
                        <td>{t.grade_name}</td>
                        <td className={ui.num}>{kg(t.net_kg)}</td>
                        <td className={ui.num}>{money(t.price_vnd_per_kg)}</td>
                        <td className={ui.num}><strong>{money(t.amount_vnd)}</strong></td>
                        <td>{status(t)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager current={paged.current} pages={paged.pages} start={paged.start} shown={paged.rows.length} total={listed.length} unit="phiếu" onPage={setPage} />
            </>
          )}
        </section>

        {chosen && (
          <DetailPanel
            title={`Phiếu ${shortNo(chosen.ticket_no)}`}
            status={status(chosen)}
            rows={[
              { icon: <UserRound size={15} />, label: 'Xã viên', value: chosen.household_name },
              { icon: <MapIcon size={15} />, label: 'Thửa / Nương', value: chosen.parcel_code },
              { icon: <Leaf size={15} />, label: 'Loại búp', value: chosen.grade_name },
              { icon: <Scale size={15} />, label: 'Khối lượng', value: `${kg(chosen.net_kg)} kg` },
              { icon: <Tag size={15} />, label: 'Đơn giá', value: `${money(chosen.price_vnd_per_kg)} đ/kg` },
              { icon: <CalendarDays size={15} />, label: 'Ngày cân', value: when(chosen) },
              ...(chosen.void_reason ? [{ icon: <Ban size={15} />, label: 'Lý do hủy', value: chosen.void_reason }] : []),
            ]}
            totalLabel="Thành tiền"
            total={`${money(chosen.amount_vnd)} đ`}
          >
            <Link className={ui.small} href={`/manager/leaf-tickets/${chosen.id}/print`} target="_blank"><Printer size={14} aria-hidden="true" />In phiếu</Link>
            {chosen.status === 'VALID' && !chosen.settlement_id && (
              <button type="button" className={`${ui.small} ${ui.solid}`} onClick={() => { setVoiding(chosen); setReason(''); setVoidError('') }}><Ban size={14} aria-hidden="true" />Hủy phiếu</button>
            )}
          </DetailPanel>
        )}
      </div>

      <Modal isOpen={creating} onClose={() => { setCreating(false); void load() }} title="Tạo phiếu cân" size="lg">
        <WeighingStation printBase="/manager/leaf-tickets" />
      </Modal>

      <Modal isOpen={!!voiding} onClose={() => setVoiding(null)} title={`Hủy phiếu ${voiding?.ticket_no ?? ''}`} size="sm">
        <form onSubmit={confirmVoid} className={kit.page}>
          <label>Lý do hủy
            <textarea className={ui.control} style={{ width: '100%', height: 'auto', padding: 10 }} required minLength={3} maxLength={200} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          {voidError && <p role="alert" className={kit.error}>{voidError}</p>}
          <button type="submit" className={kit.primary} disabled={busy || reason.trim().length < 3}>Xác nhận hủy</button>
        </form>
      </Modal>
    </div>
  )
}
