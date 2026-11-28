// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useState } from 'react'
import useSWR from 'swr'
import { BarChart3, Calendar, CalendarCheck, ChevronLeft, ChevronRight, Eye, Leaf, Plus, ShoppingBasket, Users, X } from 'lucide-react'
import { EmptyState, PageHeader, Pill } from '@/components/ui'
import type { PillProps } from '@/components/ui/Pill/Pill'
import { HarvestCalendar } from '@/components/features/schedule/HarvestCalendar'
import { addDays, dayStart } from '@/components/features/schedule/calendar-model'
import { Pager, StatCards, Tabs, pageOf } from '@/components/features/manager-web/parts'
import ui from '@/components/features/manager-web/kit.module.css'
import kit from '@/components/features/dashboard/page-kit.module.css'
import table from '@/components/features/dashboard/dashboard.module.css'
import type { HarvestEvent } from '@/domain/farm/entities/HarvestEvent'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import styles from './board.module.css'

type View = 'plan' | 'history' | 'summary'

const number = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })
const date = (value: string | number) => new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
const total = (events: HarvestEvent[], pick: (e: HarvestEvent) => number | null | undefined) => events.reduce((sum, e) => sum + (pick(e) ?? 0), 0)
const parcels = (events: HarvestEvent[]) => new Set(events.map((e) => e.parcelId)).size
/** A parcel's area counts once, however many flushes it has in the month. */
const area = (events: HarvestEvent[]) => total(Array.from(new Map(events.map((e) => [e.parcelId, e])).values()), (e) => e.areaHa)
const change = (now: number, before: number) => (before ? Math.round(((now - before) / before) * 1000) / 10 : null)

function stateOf(e: HarvestEvent, today: number): { label: string; tone: PillProps['tone'] } {
  if (e.harvestedAt) return { label: 'Đã hái', tone: 'green' }
  if (e.status === 'DANGER') return { label: 'Còn cách ly', tone: 'red' }
  const due = e.estimatedHarvestDate ? dayStart(e.estimatedHarvestDate) : today
  if (due < today) return { label: 'Chưa thu', tone: 'amber' }
  if (due === today) return { label: 'Đang thu', tone: 'green' }
  return { label: 'Theo kế hoạch', tone: 'blue' }
}

/** The head's harvest page. The month calendar and its actions open over it. */
export function ManagerHarvestBoard() {
  const today = dayStart(new Date())
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [anchorDay, setAnchorDay] = useState(today)
  const [view, setView] = useState<View>('plan')
  const [day, setDay] = useState<number | null>(null)
  const [household, setHousehold] = useState('')
  const [page, setPage] = useState(1)
  const [calendar, setCalendar] = useState<{ day: number; add: boolean } | null>(null)

  const monthStart = month.getTime()
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 1).getTime() - 1
  const lastStart = new Date(month.getFullYear(), month.getMonth() - 1, 1).getTime()
  // The month before is read too, for the "so với kỳ trước" figures.
  const { data, error, mutate } = useSWR<{ data: HarvestEvent[] }>(
    `/api/schedule/harvest?start_date=${new Date(lastStart).toISOString()}&end_date=${new Date(monthEnd).toISOString()}`,
    (url: string) => fetchJson<{ data: HarvestEvent[] }>(url),
  )

  const between = (value: string | null | undefined, from: number, to: number) => !!value && dayStart(value) >= from && dayStart(value) <= to
  const all = data?.data ?? []
  const mine = all.filter((e) => !household || e.householdName === household)
  const events = mine
    .filter((e) => between(e.estimatedHarvestDate, monthStart, monthEnd) || between(e.harvestedAt, monthStart, monthEnd))
    .sort((a, b) => (a.estimatedHarvestDate ?? '').localeCompare(b.estimatedHarvestDate ?? ''))
  const before = mine.filter((e) => between(e.estimatedHarvestDate, lastStart, monthStart - 1))
  const households = Array.from(new Set(all.map((e) => e.householdName))).sort((a, b) => a.localeCompare(b, 'vi'))
  const onDay = (e: HarvestEvent, at: number) => !!e.estimatedHarvestDate && dayStart(e.estimatedHarvestDate) === at
  const due = events.filter((e) => onDay(e, today))
  const weighed = total(events, (e) => e.harvestedKg)
  const planned = total(events, (e) => e.estimatedYieldKg)
  const percent = planned ? Math.min(100, Math.round((weighed / planned) * 100)) : 0

  const listed = events.filter((e) => (view === 'history' ? e.harvestedAt : !e.harvestedAt) && (day === null || onDay(e, day)))
  const paged = pageOf(listed, page, 5)
  const byHousehold = households
    .map((name) => ({ name, rows: events.filter((e) => e.householdName === name) }))
    .filter((group) => group.rows.length)

  const monday = addDays(anchorDay, -((new Date(anchorDay).getDay() + 6) % 7))
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i))

  const goTo = (at: number) => {
    const next = new Date(at)
    setAnchorDay(at)
    setMonth(new Date(next.getFullYear(), next.getMonth(), 1))
    setDay(null)
    setPage(1)
  }
  const pickMonth = (value: string) => {
    const [year, index] = value.split('-').map(Number)
    if (year && index) goTo(new Date(year, index - 1, 1).getTime())
  }
  const close = () => { setCalendar(null); void mutate() }
  const trend = (now: number, last: number, example: number) => {
    const value = change(now, last)
    return { change: value ?? example, note: value === null ? 'so với kỳ trước (Mẫu)' : 'so với kỳ trước' }
  }

  return (
    <div className={kit.page}>
      <PageHeader
        icon={<Calendar size={28} />}
        title="Lịch thu hái"
        description="Lập kế hoạch, theo dõi và điều phối thu hái búp chè theo lứa, theo khu vực."
        actions={<button type="button" className={kit.primary} onClick={() => setCalendar({ day: anchorDay, add: true })}><Plus size={16} aria-hidden="true" />Tạo kế hoạch thu hái</button>}
      />

      <StatCards items={[
        { label: 'Diện tích thu hái', value: `${number(area(events))} ha`, icon: <Leaf size={26} />, ...trend(area(events), area(before), 6.8) },
        { label: 'Sản lượng dự kiến', value: `${number(planned)} kg`, icon: <ShoppingBasket size={26} />, ...trend(planned, total(before, (e) => e.estimatedYieldKg), 8.5) },
        { label: 'Số nương tham gia', value: `${parcels(events)} nương`, icon: <Users size={26} />, note: `${households.length} nông hộ` },
        { label: 'Lịch thu hái hôm nay', value: `${parcels(due)} nương`, icon: <CalendarCheck size={26} />, note: `Diện tích: ${number(area(due))} ha` },
      ]} />

      <div className={styles.strip}>
        <section className={styles.card} aria-label="Tuần">
          <div className={styles.head}>
            <h2>Tháng {month.getMonth() + 1}, {month.getFullYear()}</h2>
            <button type="button" className={ui.page} aria-label="Tuần trước" onClick={() => goTo(addDays(anchorDay, -7))}><ChevronLeft size={16} aria-hidden="true" /></button>
            <button type="button" className={ui.page} aria-label="Tuần sau" onClick={() => goTo(addDays(anchorDay, 7))}><ChevronRight size={16} aria-hidden="true" /></button>
          </div>
          <ol className={styles.week}>
            {week.map((at, i) => (
              <li key={at}>
                <span>{['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][i]}</span>
                <button type="button" aria-pressed={at === day} data-today={at === today || undefined} data-busy={all.some((e) => onDay(e, at)) || undefined} aria-label={`Lọc ngày ${date(at)}`} onClick={() => { setDay(at === day ? null : at); setPage(1) }}>
                  {new Date(at).getDate()}
                </button>
              </li>
            ))}
          </ol>
        </section>
        <section className={styles.card} aria-label="Tiến độ thu hái">
          <h2><BarChart3 size={20} aria-hidden="true" />Tiến độ thu hái tháng {month.getMonth() + 1}/{month.getFullYear()}</h2>
          <p className={styles.progress}><progress value={percent} max={100} aria-label="Sản lượng đã thu" /><strong>{percent}%</strong></p>
          <p className={styles.muted}>Đã thu: <strong>{number(weighed)} kg</strong> | Kế hoạch: <strong>{number(planned)} kg</strong></p>
        </section>
      </div>

      <div className={ui.bar}>
        <Tabs<View>
          label="Cách xem"
          value={view}
          onChange={(next) => { setView(next); setPage(1) }}
          items={[
            { key: 'plan', label: 'Kế hoạch thu hái' },
            { key: 'history', label: 'Lịch sử thu hái' },
            { key: 'summary', label: 'Tổng hợp sản lượng' },
          ]}
        />
        <div className={styles.filters}>
          <input type="month" className={ui.control} aria-label="Tháng" value={`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`} onChange={(e) => pickMonth(e.target.value)} />
          <select className={ui.control} aria-label="Nông hộ" value={household} onChange={(e) => { setHousehold(e.target.value); setPage(1) }}>
            <option value="">Tất cả nông hộ</option>
            {households.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
      </div>

      <div className={kit.card}>
        {error ? (
          <div className={kit.state}>{LOAD_FAILED_MESSAGE}</div>
        ) : !data ? (
          <div className={kit.state}>Đang tải...</div>
        ) : view === 'summary' ? (
          byHousehold.length === 0 ? <EmptyState icon={<Leaf />} title="Tháng này chưa có lứa hái." /> : (
            <div className={table.tableWrap}>
              <table className={table.table}>
                <thead><tr><th>Nông hộ</th><th>Số lứa</th><th>Diện tích (ha)</th><th>Sản lượng dự kiến (kg)</th><th>Đã thu (kg)</th></tr></thead>
                <tbody>
                  {byHousehold.map((group) => (
                    <tr key={group.name}>
                      <td><strong>{group.name}</strong></td>
                      <td>{group.rows.length}</td>
                      <td>{number(area(group.rows))}</td>
                      <td>{number(total(group.rows, (e) => e.estimatedYieldKg))}</td>
                      <td>{number(total(group.rows, (e) => e.harvestedKg))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : listed.length === 0 ? (
          <EmptyState icon={<Leaf />} title={view === 'history' ? 'Chưa có lứa nào đã hái.' : 'Không có lứa nào đang chờ hái.'} />
        ) : (
          <>
            <div className={table.tableWrap}>
              <table className={table.table}>
                <thead>
                  <tr><th>#</th><th>Nương / Nông hộ</th><th>Giống chè</th><th>Diện tích (ha)</th><th>Thời gian thu hái</th><th>Sản lượng dự kiến (kg)</th><th>Trạng thái</th><th>Thao tác</th></tr>
                </thead>
                <tbody>
                  {paged.rows.map((e, index) => {
                    const when = view === 'history' ? e.harvestedAt : e.estimatedHarvestDate
                    const state = stateOf(e, today)
                    return (
                      <tr key={e.cycleId}>
                        <td>{paged.start + index + 1}</td>
                        <td><strong>{e.parcelName}</strong> – {e.householdName}</td>
                        <td>{e.cropType}</td>
                        <td>{e.areaHa != null ? number(e.areaHa) : '—'}</td>
                        <td>{when ? date(when) : '—'}</td>
                        <td>{e.estimatedYieldKg ? number(e.estimatedYieldKg) : '—'}</td>
                        <td><Pill tone={state.tone}>{state.label}</Pill></td>
                        <td><button type="button" className={ui.small} aria-label={`Xem ${e.parcelName}`} onClick={() => setCalendar({ day: dayStart(when ?? new Date().toISOString()), add: false })}><Eye size={14} aria-hidden="true" />Xem</button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pager current={paged.current} pages={paged.pages} start={paged.start} shown={paged.rows.length} total={listed.length} unit="lứa" onPage={setPage} />
          </>
        )}
      </div>

      {calendar && (
        <div className={styles.overlay} role="dialog" aria-label="Lịch tháng">
          <div className={styles.sheet}>
            <button type="button" className={ui.small} onClick={close}><X size={14} aria-hidden="true" />Đóng</button>
            <HarvestCalendar userRole="MANAGER" embedded initialDay={calendar.day} initialAdd={calendar.add} />
          </div>
        </div>
      )}
    </div>
  )
}
