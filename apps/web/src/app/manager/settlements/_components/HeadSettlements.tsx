// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Banknote, CalendarDays, Check, Coins, Download, Eye, Hourglass, Lock, NotebookPen, Package, Plus, Printer, Scale, Sprout, Tag, UserRound, Users, Wallet } from 'lucide-react'
import { EmptyState, PageHeader, Pill } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { Pager, StatCards, Tabs, pageOf } from '@/components/features/manager-web/parts'
import { DetailPanel } from '@/components/features/manager-web/DetailPanel'
import ui from '@/components/features/manager-web/kit.module.css'
import kit from '@/components/features/dashboard/page-kit.module.css'
import table from '@/components/features/dashboard/dashboard.module.css'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import { downloadCsv } from '@/lib/manager/download-csv'
import { formatVnd } from '@/lib/ledger/money'
import type { SettlementDetail, SettlementLine, SettlementPeriod } from '@/lib/ledger/types'
import { dayMonthYear } from '@/lib/weighing/format'

type View = 'ALL' | 'PAID' | 'WAITING'

const kg = (value: number | string) => Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 1 })
const METHODS = { TRANSFER: 'Chuyển khoản', CASH: 'Tiền mặt' } as const
const periodLabel = (p: SettlementPeriod) => `${dayMonthYear(p.date_from)} – ${dayMonthYear(p.date_to)}`
const nothingToPay = (line: SettlementLine) => /^0*$/.test(line.payable_vnd)

/** One settlement period: each household's line, what is paid and what still waits. */
export function HeadSettlements() {
  const [periods, setPeriods] = useState<SettlementPeriod[] | null>(null)
  const [periodId, setPeriodId] = useState('')
  const [detail, setDetail] = useState<SettlementDetail | null>(null)
  const [failed, setFailed] = useState(false)
  const [view, setView] = useState<View>('ALL')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [chosenId, setChosenId] = useState('')
  const [creating, setCreating] = useState(false)
  const [range, setRange] = useState({ from: '', to: '' })
  const [paying, setPaying] = useState<SettlementLine | null>(null)
  const [method, setMethod] = useState<'TRANSFER' | 'CASH'>('TRANSFER')
  const [ref, setRef] = useState('')
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  const loadPeriods = useCallback((select?: string) => {
    fetchJson<{ data: SettlementPeriod[] }>('/api/settlements')
      .then((body) => {
        setPeriods(body.data)
        setPeriodId((current) => select ?? (current || body.data[0]?.id || ''))
        setFailed(false)
      })
      .catch(() => setFailed(true))
  }, [])
  useEffect(() => { loadPeriods() }, [loadPeriods])

  const loadDetail = useCallback(() => {
    if (!periodId) return
    fetchJson<{ data: SettlementDetail }>(`/api/settlements/${periodId}`)
      .then((body) => { setDetail(body.data); setFailed(false) })
      .catch(() => { setDetail(null); setFailed(true) })
  }, [periodId])
  useEffect(() => { loadDetail() }, [loadDetail])

  const period = detail?.period.id === periodId ? detail.period : null
  const closed = period?.status === 'CLOSED'
  const lines = period ? detail!.lines : []
  const paid = lines.filter((l) => l.paid_at)
  const waiting = lines.filter((l) => !l.paid_at && !nothingToPay(l))
  const needle = search.trim().toLocaleLowerCase('vi')
  const listed = (view === 'PAID' ? paid : view === 'WAITING' ? waiting : lines).filter((l) => !needle || l.household_name.toLocaleLowerCase('vi').includes(needle))
  const paged = pageOf(listed, page, 8)
  const chosen = listed.find((l) => l.household_id === chosenId) ?? paged.rows[0] ?? null
  const code = (line: SettlementLine) => `${period?.code ?? ''}-${String(lines.indexOf(line) + 1).padStart(2, '0')}`
  const stateOf = (line: SettlementLine) =>
    !closed ? <Pill tone="neutral">Bản nháp</Pill>
      : nothingToPay(line) ? <Pill tone="neutral">Không chi trả</Pill>
        : line.paid_at ? <Pill tone="green">Đã chi trả</Pill> : <Pill tone="amber">Chờ chi trả</Pill>

  async function submit(url: string, payload: object, fallback: string, done: (data: { id?: string }) => void) {
    setBusy(true)
    setFormError('')
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setFormError(json?.error?.message || fallback); return }
      done(json.data ?? {})
    } catch {
      setFormError('Lỗi kết nối máy chủ.')
    } finally {
      setBusy(false)
    }
  }

  const create = (event: React.FormEvent) => {
    event.preventDefault()
    void submit('/api/settlements', { date_from: range.from, date_to: range.to }, 'Không tạo được kỳ quyết toán.', (data) => { setCreating(false); loadPeriods(data.id) })
  }
  const pay = (event: React.FormEvent) => {
    event.preventDefault()
    if (!paying) return
    void submit(`/api/settlements/${periodId}/lines/${paying.id}/payout`, { method, ...(ref.trim() ? { ref: ref.trim() } : {}) }, 'Không ghi được khoản chi trả.', () => { setPaying(null); loadDetail() })
  }
  const exportRows = () => downloadCsv(`${period?.code ?? 'quyet-toan'}.csv`, [
    ['Mã', 'Xã viên', 'Kg búp', 'Tiền búp', 'Vật tư', 'Nợ kỳ trước', 'Thực lĩnh', 'Đã trả'],
    ...listed.map((l) => [code(l), l.household_name, String(l.leaf_net_kg), l.leaf_amount_vnd, l.advances_vnd, l.debt_in_vnd, l.payable_vnd, l.paid_at ? 'Có' : 'Chưa']),
  ])
  const average = (line: SettlementLine) => (Number(line.leaf_net_kg) ? `${Math.round(Number(line.leaf_amount_vnd) / Number(line.leaf_net_kg)).toLocaleString('vi-VN')} đ/kg` : '—')

  return (
    <div className={kit.page}>
      <PageHeader
        icon={<Wallet size={28} />}
        title="Quyết toán"
        description="Tổng hợp và chi trả tiền thu mua búp chè cho xã viên."
        actions={
          <>
            <button type="button" className={kit.primary} onClick={() => { setRange({ from: '', to: '' }); setFormError(''); setCreating(true) }}><Plus size={16} aria-hidden="true" />Tạo quyết toán</button>
            <button type="button" className={kit.secondary} disabled={listed.length === 0} onClick={exportRows}><Download size={16} aria-hidden="true" />Xuất</button>
          </>
        }
      />

      <StatCards items={[
        { label: 'Xã viên đã quyết toán', value: `${paid.length} người`, icon: <Users size={26} /> },
        { label: 'Tổng khối lượng', value: `${kg(lines.reduce((sum, l) => sum + Number(l.leaf_net_kg), 0))} kg`, icon: <Sprout size={26} /> },
        { label: 'Tổng thành tiền', value: `${formatVnd(period ? detail!.totals.payable_vnd : '0')} đ`, icon: <Coins size={26} /> },
        { label: 'Chờ quyết toán', value: `${waiting.length} người`, icon: <Hourglass size={26} /> },
      ]} />

      <div className={ui.bar}>
        <Tabs<View>
          label="Trạng thái"
          value={view}
          onChange={(key) => { setView(key); setPage(1) }}
          items={[{ key: 'ALL', label: `Tất cả (${lines.length})` }, { key: 'PAID', label: `Đã chi trả (${paid.length})` }, { key: 'WAITING', label: `Chờ chi trả (${waiting.length})` }]}
        />
        <input type="search" className={`${ui.control} ${ui.grow}`} aria-label="Tìm xã viên" placeholder="Tìm xã viên..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
        <select className={ui.control} aria-label="Kỳ quyết toán" value={periodId} onChange={(e) => { setPeriodId(e.target.value); setPage(1) }}>
          {(periods ?? []).map((p) => <option key={p.id} value={p.id}>{periodLabel(p)}{p.status === 'DRAFT' ? ' (nháp)' : ''}</option>)}
        </select>
      </div>

      <div className={chosen ? ui.split : undefined}>
        <section className={kit.card} aria-label="Danh sách quyết toán">
          {failed ? <div className={kit.state}>{LOAD_FAILED_MESSAGE}</div>
            : periods?.length === 0 ? <EmptyState icon={<Wallet />} title="Chưa có kỳ quyết toán nào. Bấm Tạo quyết toán." />
              : !period ? <div className={kit.state}>Đang tải...</div>
                : listed.length === 0 ? <EmptyState icon={<Wallet />} title="Không có xã viên nào trong mục này." />
                  : (
                    <>
                      <div className={table.tableWrap}>
                        <table className={table.table}>
                          <thead><tr><th>#</th><th>Mã quyết toán</th><th>Xã viên</th><th className={ui.num}>Khối lượng (kg)</th><th className={ui.num}>Thành tiền (đ)</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
                          <tbody className={ui.rows}>
                            {paged.rows.map((line, index) => (
                              <tr key={line.household_id} aria-selected={line === chosen} onClick={() => setChosenId(line.household_id)}>
                                <td>{paged.start + index + 1}</td>
                                <td>{code(line)}</td>
                                <td>{line.household_name}</td>
                                <td className={ui.num}>{kg(line.leaf_net_kg)}</td>
                                <td className={ui.num}><strong>{formatVnd(line.payable_vnd)}</strong></td>
                                <td>{stateOf(line)}</td>
                                <td><button type="button" className={ui.small} aria-label={`Xem ${line.household_name}`} onClick={() => setChosenId(line.household_id)}><Eye size={14} aria-hidden="true" /></button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <Pager current={paged.current} pages={paged.pages} start={paged.start} shown={paged.rows.length} total={listed.length} unit="quyết toán" onPage={setPage} />
                    </>
                  )}
        </section>

        {chosen && period && (
          <DetailPanel
            title={`Quyết toán ${code(chosen)}`}
            status={stateOf(chosen)}
            rows={[
              { icon: <UserRound size={15} />, label: 'Xã viên', value: chosen.household_name },
              { icon: <CalendarDays size={15} />, label: 'Kỳ quyết toán', value: periodLabel(period) },
              { icon: <Scale size={15} />, label: 'Tổng khối lượng', value: `${kg(chosen.leaf_net_kg)} kg` },
              { icon: <Tag size={15} />, label: 'Đơn giá bình quân', value: average(chosen) },
              { icon: <Coins size={15} />, label: 'Tiền búp', value: `${formatVnd(chosen.leaf_amount_vnd)} đ` },
              { icon: <Package size={15} />, label: 'Trừ vật tư', value: `${formatVnd(chosen.advances_vnd)} đ` },
              { icon: <Banknote size={15} />, label: 'Nợ kỳ trước', value: `${formatVnd(chosen.debt_in_vnd)} đ` },
              { icon: <CalendarDays size={15} />, label: 'Ngày chi trả', value: chosen.paid_at ? dayMonthYear(chosen.paid_at.slice(0, 10)) : '—' },
              { icon: <Wallet size={15} />, label: 'Hình thức', value: chosen.payment_method ? METHODS[chosen.payment_method] : '—' },
              { icon: <NotebookPen size={15} />, label: 'Ghi chú', value: chosen.payment_ref || '—' },
            ]}
            totalLabel="Thành tiền"
            total={`${formatVnd(chosen.payable_vnd)} đ`}
          >
            {chosen.id
              ? <Link className={ui.small} href={`/manager/settlements/${periodId}/slip/${chosen.id}`}><Printer size={14} aria-hidden="true" />In quyết toán</Link>
              : <button type="button" className={ui.small} disabled title="Chốt kỳ rồi mới in được phiếu"><Printer size={14} aria-hidden="true" />In quyết toán</button>}
            {!closed && <Link className={`${ui.small} ${ui.solid}`} href={`/manager/settlements/${periodId}`}><Lock size={14} aria-hidden="true" />Xem và chốt kỳ</Link>}
            {closed && chosen.id && !chosen.paid_at && !nothingToPay(chosen) && (
              <button type="button" className={`${ui.small} ${ui.solid}`} onClick={() => { setPaying(chosen); setMethod('TRANSFER'); setRef(''); setFormError('') }}><Check size={14} aria-hidden="true" />Đánh dấu đã chi trả</button>
            )}
          </DetailPanel>
        )}
      </div>

      <Modal isOpen={creating} onClose={() => setCreating(false)} title="Tạo kỳ quyết toán" size="sm">
        <form onSubmit={create} className={kit.page}>
          <label>Từ ngày <input className={ui.control} type="date" required value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
          <label>Đến ngày <input className={ui.control} type="date" required min={range.from} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
          {formError && <p role="alert" className={kit.error}>{formError}</p>}
          <button type="submit" className={kit.primary} disabled={busy || !range.from || !range.to}>Tạo kỳ</button>
        </form>
      </Modal>

      <Modal isOpen={!!paying} onClose={() => setPaying(null)} title={`Đã chi trả cho ${paying?.household_name ?? ''}`} size="sm">
        <form onSubmit={pay} className={kit.page}>
          <p>Số tiền: <strong>{formatVnd(paying?.payable_vnd ?? '0')} đ</strong>. Ghi rồi không sửa lại được.</p>
          <label>Hình thức
            <select className={ui.control} value={method} onChange={(e) => setMethod(e.target.value as 'TRANSFER' | 'CASH')}>
              <option value="TRANSFER">Chuyển khoản</option>
              <option value="CASH">Tiền mặt</option>
            </select>
          </label>
          <label>Mã giao dịch (nếu có) <input className={ui.control} maxLength={100} value={ref} onChange={(e) => setRef(e.target.value)} /></label>
          {formError && <p role="alert" className={kit.error}>{formError}</p>}
          <button type="submit" className={kit.primary} disabled={busy}>Xác nhận đã trả</button>
        </form>
      </Modal>
    </div>
  )
}
