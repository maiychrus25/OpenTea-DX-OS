// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarCheck, CalendarDays, Download, Eye, Flame, Hourglass, Layers, LineChart, NotebookPen, Package, Plus, RefreshCw, Scale, Sprout, UserRound } from 'lucide-react'
import { EmptyState, PageHeader, Pill } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { Pager, Sample, StatCards, Tabs, pageOf } from '@/components/features/manager-web/parts'
import { DetailPanel } from '@/components/features/manager-web/DetailPanel'
import { Steps } from '@/components/features/manager-web/Steps'
import ui from '@/components/features/manager-web/kit.module.css'
import kit from '@/components/features/dashboard/page-kit.module.css'
import table from '@/components/features/dashboard/dashboard.module.css'
import { localDay } from '@/domain/shared/local-day'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import { downloadCsv } from '@/lib/manager/download-csv'
import { processingErrorText } from '@/lib/processing/errors'
import type { BatchView } from '@/lib/processing/types'
import { dayMonthYear } from '@/lib/weighing/format'

type View = 'ALL' | 'OPEN' | 'FINISHED' | 'WAITING'

const kg = (value: number) => value.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const stamp = (value: string | null) => (value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
const pill = (b: BatchView) =>
  b.status === 'FINISHED' ? <Pill tone="green">Hoàn thành</Pill> : b.status === 'OPEN' ? <Pill tone="blue">Đang chế biến</Pill> : <Pill tone="red">Đã hủy</Pill>
/** The batch record has no tea type; the design's column is filled with an example. */
const SAMPLE_TEA = 'Chè Tân Cương'

/** The cooperative's drying batches with the chosen one beside the list. */
export function HeadProcessing({ forecast }: { forecast?: React.ReactNode }) {
  const [batches, setBatches] = useState<BatchView[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [view, setView] = useState<View>('ALL')
  const [search, setSearch] = useState('')
  const [month, setMonth] = useState('')
  const [page, setPage] = useState(1)
  const [chosenId, setChosenId] = useState('')
  const [creating, setCreating] = useState(false)
  const [showForecast, setShowForecast] = useState(false)
  const [form, setForm] = useState({ processed_on: localDay(new Date()), master_name: '', shift: '', notes: '' })
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    fetchJson<{ data: BatchView[] }>('/api/processing-batches')
      .then((body) => { setBatches(body.data); setFailed(false) })
      .catch(() => setFailed(true))
  }, [])
  useEffect(() => { load() }, [load])

  const inMonth = (batches ?? []).filter((b) => !month || b.processed_on.startsWith(month))
  const count = (status: BatchView['status']) => inMonth.filter((b) => b.status === status).length
  const needle = search.trim().toLocaleLowerCase('vi')
  const listed = inMonth.filter((b) => (view === 'ALL' || b.status === view) && (!needle || `${b.batch_code} ${b.master_name ?? ''}`.toLocaleLowerCase('vi').includes(needle)))
  const paged = pageOf(listed, page, 8)
  const chosen = listed.find((b) => b.id === chosenId) ?? paged.rows[0] ?? null

  async function create(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setFormError('')
    try {
      const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v))
      const res = await fetch('/api/processing-batches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setFormError(processingErrorText(json?.error?.code, json?.error?.message, 'Không mở được mẻ mới.')); return }
      setCreating(false)
      setChosenId(json.data?.id ?? '')
      load()
    } catch {
      setFormError('Lỗi kết nối máy chủ.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={kit.page}>
      <PageHeader
        icon={<Flame size={28} />}
        title="Xưởng sao sấy"
        description="Quản lý các mẻ chế biến, sao sấy chè."
        actions={
          <>
            <button type="button" className={kit.primary} onClick={() => { setFormError(''); setCreating(true) }}><Plus size={16} aria-hidden="true" />Tạo mẻ chế biến</button>
            {forecast && <button type="button" className={kit.secondary} onClick={() => setShowForecast(true)}><LineChart size={16} aria-hidden="true" />Dự báo 14 ngày</button>}
            <button type="button" className={kit.secondary} disabled={listed.length === 0} onClick={() => downloadCsv('me-sao-say.csv', [['Mã mẻ', 'Ngày', 'Kg tươi', 'Kg khô', 'Nghệ nhân'], ...listed.map((b) => [b.batch_code, b.processed_on, String(b.fresh_kg), String(b.dry_kg), b.master_name ?? ''])])}><Download size={16} aria-hidden="true" />Xuất</button>
          </>
        }
      />
      <StatCards items={[
        { label: 'Tổng mẻ', value: `${inMonth.length} mẻ`, icon: <Layers size={26} /> },
        { label: 'Đã hoàn thành', value: `${count('FINISHED')} mẻ`, icon: <CalendarCheck size={26} /> },
        { label: 'Đang chế biến', value: `${count('OPEN')} mẻ`, icon: <RefreshCw size={26} /> },
        { label: 'Chờ xử lý', value: '1 mẻ', icon: <Hourglass size={26} />, tone: 'amber', sample: true },
      ]} />
      <div className={ui.bar}>
        <Tabs<View> label="Trạng thái" value={view} onChange={(key) => { setView(key); setPage(1) }} items={[{ key: 'ALL', label: `Tất cả (${inMonth.length})` }, { key: 'OPEN', label: `Đang chế biến (${count('OPEN')})` }, { key: 'FINISHED', label: `Hoàn thành (${count('FINISHED')})` }, { key: 'WAITING', label: 'Chờ xử lý (Mẫu)' }]} />
        <input type="search" className={`${ui.control} ${ui.grow}`} aria-label="Tìm mẻ" placeholder="Tìm mã mẻ, nghệ nhân..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
        <input type="month" className={ui.control} aria-label="Tháng" value={month} onChange={(e) => { setMonth(e.target.value); setPage(1) }} />
      </div>
      <div className={chosen ? ui.split : undefined}>
        <section className={kit.card} aria-label="Danh sách mẻ">
          {failed ? <div className={kit.state}>{LOAD_FAILED_MESSAGE}</div> : !batches ? <div className={kit.state}>Đang tải danh sách mẻ...</div> : listed.length === 0 ? <EmptyState icon={<Flame />} title="Chưa có mẻ nào." /> : (
            <>
              <div className={table.tableWrap}>
                <table className={table.table}>
                  <thead><tr><th>#</th><th>Mã mẻ</th><th>Loại chè <Sample /></th><th className={ui.num}>Đầu vào (kg)</th><th className={ui.num}>Thành phẩm (kg)</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
                  <tbody className={ui.rows}>
                    {paged.rows.map((b, index) => (
                      <tr key={b.id} aria-selected={b.id === chosen?.id} onClick={() => setChosenId(b.id)}>
                        <td>{paged.start + index + 1}</td>
                        <td><Link className={table.action} href={`/manager/processing/${b.id}`} onClick={(e) => e.stopPropagation()}>{b.batch_code}</Link></td>
                        <td>{SAMPLE_TEA}</td>
                        <td className={ui.num}>{kg(b.fresh_kg)}</td>
                        <td className={ui.num}>{kg(b.dry_kg)}</td>
                        <td>{pill(b)}{b.out_of_band && <> <Pill tone="amber">Lệch chuẩn</Pill></>}</td>
                        <td><button type="button" className={ui.small} aria-label={`Xem ${b.batch_code}`} onClick={() => setChosenId(b.id)}><Eye size={14} aria-hidden="true" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager current={paged.current} pages={paged.pages} start={paged.start} shown={paged.rows.length} total={listed.length} unit="mẻ" onPage={setPage} />
            </>
          )}
        </section>
        {chosen && (
          <DetailPanel
            title={`Mẻ ${chosen.batch_code}`}
            status={pill(chosen)}
            rows={[
              { icon: <Sprout size={15} />, label: 'Loại chè', value: <>{SAMPLE_TEA} <Sample /></> },
              { icon: <Scale size={15} />, label: 'Đầu vào', value: `${kg(chosen.fresh_kg)} kg` },
              { icon: <Package size={15} />, label: 'Thành phẩm', value: `${kg(chosen.dry_kg)} kg` },
              { icon: <CalendarDays size={15} />, label: 'Ngày chế biến', value: dayMonthYear(chosen.processed_on) },
              { icon: <UserRound size={15} />, label: 'Người phụ trách', value: chosen.master_name || '—' },
              { icon: <NotebookPen size={15} />, label: 'Ghi chú', value: chosen.cancel_reason || chosen.notes || '—' },
            ]}
            extra={<Steps title="Quy trình chế biến" steps={[
              { label: 'Tiếp nhận nguyên liệu', when: stamp(chosen.created_at), done: true },
              { label: 'Sao chè', when: '—', done: chosen.status === 'FINISHED', sample: true },
              { label: 'Sấy khô', when: '—', done: chosen.status === 'FINISHED', sample: true },
              { label: 'Hoàn thành', when: stamp(chosen.finished_at), done: chosen.status === 'FINISHED' },
            ]} />}
          >
            <Link className={`${ui.small} ${ui.solid}`} href={`/manager/processing/${chosen.id}`}>Mở mẻ này</Link>
          </DetailPanel>
        )}
      </div>

      <Modal isOpen={creating} onClose={() => setCreating(false)} title="Mở mẻ mới" size="sm">
        <form onSubmit={create} className={kit.page}>
          <label>Ngày chế biến <input className={ui.control} type="date" required max={localDay(new Date())} value={form.processed_on} onChange={(e) => setForm({ ...form, processed_on: e.target.value })} /></label>
          <label>Nghệ nhân sao <input className={ui.control} maxLength={80} value={form.master_name} onChange={(e) => setForm({ ...form, master_name: e.target.value })} /></label>
          <label>Ca <input className={ui.control} maxLength={40} value={form.shift} onChange={(e) => setForm({ ...form, shift: e.target.value })} /></label>
          <label>Ghi chú <input className={ui.control} maxLength={500} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          {formError && <p role="alert" className={kit.error}>{formError}</p>}
          <button type="submit" className={kit.primary} disabled={busy || !form.processed_on}>Mở mẻ mới</button>
        </form>
      </Modal>
      <Modal isOpen={showForecast} onClose={() => setShowForecast(false)} title="Dự báo 14 ngày" size="lg">{forecast}</Modal>
    </div>
  )
}
