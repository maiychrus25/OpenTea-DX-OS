// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useState } from 'react'
import useSWR from 'swr'
import { Calendar, CalendarCheck, Eye, Leaf, Plus, ShoppingBasket, Sprout } from 'lucide-react'
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

type View = 'plan' | 'history' | 'summary' | 'calendar'

const number = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })
const date = (value: string | number) => new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
const total = (events: HarvestEvent[], pick: (e: HarvestEvent) => number | null | undefined) => events.reduce((sum, e) => sum + (pick(e) ?? 0), 0)
const parcels = (events: HarvestEvent[]) => new Set(events.map((e) => e.parcelId)).size
/** A parcel's area counts once, however many flushes it has in the month. */
const area = (events: HarvestEvent[]) => total(Array.from(new Map(events.map((e) => [e.parcelId, e])).values()), (e) => e.areaHa)

function stateOf(e: HarvestEvent, today: number): { label: string; tone: PillProps['tone'] } {
  if (e.harvestedAt) return { label: 'Đã hái', tone: 'green' }
  if (e.status === 'DANGER') return { label: 'Còn cách ly', tone: 'red' }
  const due = e.estimatedHarvestDate ? dayStart(e.estimatedHarvestDate) : today
  if (due < today) return { label: 'Quá ngày hẹn', tone: 'amber' }
  if (due === today) return { label: 'Đến ngày hái', tone: 'green' }
  return { label: 'Theo kế hoạch', tone: 'blue' }
}

/** The head's harvest page: the month in figures and a table, with the month calendar behind its own tab. */
export function ManagerHarvestBoard() {
  const today = dayStart(new Date())
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [view, setView] = useState<View>('plan')
  const [day, setDay] = useState<number | null>(null)
  const [household, setHousehold] = useState('')
  const [page, setPage] = useState(1)
  const [calendar, setCalendar] = useState<{ day: number; add: boolean }>({ day: today, add: false })

  const monthStart = month.getTime()
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 1).getTime() - 1
  const { data, error, mutate } = useSWR<{ data: HarvestEvent[] }>(
    `/api/schedule/harvest?start_date=${new Date(monthStart).toISOString()}&end_date=${new Date(monthEnd).toISOString()}`,
    (url: string) => fetchJson<{ data: HarvestEvent[] }>(url),
  )

  const inMonth = (value: string | null | undefined) => !!value && dayStart(value) >= monthStart && dayStart(value) <= monthEnd
  const all = data?.data ?? []
  const events = all
    .filter((e) => (inMonth(e.estimatedHarvestDate) || inMonth(e.harvestedAt)) && (!household || e.householdName === household))
    .sort((a, b) => (a.estimatedHarvestDate ?? '').localeCompare(b.estimatedHarvestDate ?? ''))
  const households = Array.from(new Set(all.map((e) => e.householdName))).sort((a, b) => a.localeCompare(b, 'vi'))
  const onDay = (e: HarvestEvent, at: number) => !!e.estimatedHarvestDate && dayStart(e.estimatedHarvestDate) === at
  const todayShown = today >= monthStart && today <= monthEnd
  const due = events.filter((e) => onDay(e, today))
  const done = events.filter((e) => e.harvestedAt)
  const percent = events.length ? Math.round((done.length / events.length) * 100) : 0

  const listed = events.filter((e) => (view === 'history' ? e.harvestedAt : !e.harvestedAt) && (day === null || onDay(e, day)))
  const paged = pageOf(listed, page)
  const byHousehold = households
    .map((name) => ({ name, rows: events.filter((e) => e.householdName === name) }))
    .filter((group) => group.rows.length)

  const anchor = day ?? (todayShown ? today : monthStart)
  const monday = addDays(anchor, -((new Date(anchor).getDay() + 6) % 7))
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i))

  const openCalendar = (at: number, add = false) => { setCalendar({ day: at, add }); setView('calendar') }
  const show = (next: View) => {
    // The calendar writes through its own requests, so the figures are read again on the way back.
    if (view === 'calendar' && next !== 'calendar') void mutate()
    if (next === 'calendar') setCalendar({ day: anchor, add: false })
    setView(next)
    setPage(1)
  }
  const pickMonth = (value: string) => {
    const [year, index] = value.split('-').map(Number)
    if (!year || !index) return
    setMonth(new Date(year, index - 1, 1))
    setDay(null)
    setPage(1)
  }

  return (
    <div className={kit.page}>
      <PageHeader
        icon={<Calendar size={28} />}
        title="Lịch thu hái"
        description="Lập kế hoạch và theo dõi thu hái búp chè theo lứa."
        actions={<button type="button" className={kit.primary} onClick={() => openCalendar(anchor, true)}><Plus size={16} aria-hidden="true" />Thêm lứa hái</button>}
      />

      {view !== 'calendar' && (
        <>
          <StatCards items={[
            { label: 'Diện tích có lịch hái', value: `${number(area(events))} ha`, icon: <Leaf size={26} />, note: `Tháng ${month.getMonth() + 1}` },
            { label: 'Sản lượng dự kiến', value: `${number(total(events, (e) => e.estimatedYieldKg))} kg`, icon: <ShoppingBasket size={26} />, note: `${events.length} lứa` },
            { label: 'Số thửa có lịch', value: `${parcels(events)} thửa`, icon: <Sprout size={26} />, note: `${households.length} nông hộ` },
            { label: 'Lịch hái hôm nay', value: todayShown ? `${parcels(due)} thửa` : '—', icon: <CalendarCheck size={26} />, note: todayShown ? `Diện tích: ${number(area(due))} ha` : 'Đang xem tháng khác' },
          ]} />

          <div className={styles.strip}>
            <section className={styles.card} aria-label="Tuần">
              <h2>Tuần {date(week[0]).slice(0, 5)} – {date(week[6]).slice(0, 5)}</h2>
              <ol className={styles.week}>
                {week.map((at, i) => (
                  <li key={at}>
                    <span>{['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][i]}</span>
                    <button type="button" aria-pressed={at === day} data-today={at === today || undefined} data-busy={events.some((e) => onDay(e, at)) || undefined} aria-label={`Lọc ngày ${date(at)}`} onClick={() => { setDay(at === day ? null : at); setPage(1) }}>
                      {new Date(at).getDate()}
                    </button>
                  </li>
                ))}
              </ol>
            </section>
            <section className={styles.card} aria-label="Tiến độ thu hái">
              <h2>Tiến độ thu hái tháng {month.getMonth() + 1}</h2>
              <p className={styles.progress}><progress value={percent} max={100} aria-label="Lứa đã hái" /><strong>{percent}%</strong></p>
              <p className={styles.muted}>Đã hái: <strong>{done.length} lứa</strong> · Kế hoạch: <strong>{events.length} lứa</strong></p>
            </section>
          </div>
        </>
      )}

      <div className={ui.bar}>
        <Tabs<View>
          label="Cách xem"
          value={view}
          onChange={show}
          items={[
            { key: 'plan', label: 'Kế hoạch thu hái' },
            { key: 'history', label: 'Lịch sử thu hái' },
            { key: 'summary', label: 'Tổng hợp sản lượng' },
            { key: 'calendar', label: 'Lịch tháng' },
          ]}
        />
        {view !== 'calendar' && (
          <div className={styles.filters}>
            <input type="month" className={ui.control} aria-label="Tháng" value={`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`} onChange={(e) => pickMonth(e.target.value)} />
            <select className={ui.control} aria-label="Nông hộ" value={household} onChange={(e) => { setHousehold(e.target.value); setPage(1) }}>
              <option value="">Tất cả nông hộ</option>
              {households.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
        )}
      </div>

      {view === 'calendar' ? (
        <HarvestCalendar userRole="MANAGER" embedded initialDay={calendar.day} initialAdd={calendar.add} />
      ) : (
        <div className={kit.card}>
          {error ? (
            <div className={kit.state}>{LOAD_FAILED_MESSAGE}</div>
          ) : !data ? (
            <div className={kit.state}>Đang tải...</div>
          ) : view === 'summary' ? (
            byHousehold.length === 0 ? <EmptyState icon={<Leaf />} title="Tháng này chưa có lứa hái." /> : (
              <div className={table.tableWrap}>
                <table className={table.table}>
                  <thead><tr><th>Nông hộ</th><th>Số lứa</th><th>Đã hái</th><th>Diện tích (ha)</th><th>Sản lượng dự kiến (kg)</th></tr></thead>
                  <tbody>
                    {byHousehold.map((group) => (
                      <tr key={group.name}>
                        <td><strong>{group.name}</strong></td>
                        <td>{group.rows.length}</td>
                        <td>{group.rows.filter((e) => e.harvestedAt).length}</td>
                        <td>{number(area(group.rows))}</td>
                        <td>{number(total(group.rows, (e) => e.estimatedYieldKg))}</td>
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
                    <tr><th>#</th><th>Thửa</th><th>Nông hộ</th><th>Giống chè</th><th>Diện tích (ha)</th><th>{view === 'history' ? 'Ngày hái' : 'Ngày hái dự kiến'}</th><th>Sản lượng dự kiến (kg)</th><th>Trạng thái</th><th>Thao tác</th></tr>
                  </thead>
                  <tbody>
                    {paged.rows.map((e, index) => {
                      const when = view === 'history' ? e.harvestedAt : e.estimatedHarvestDate
                      const state = stateOf(e, today)
                      return (
                        <tr key={e.cycleId}>
                          <td>{paged.start + index + 1}</td>
                          <td><strong>{e.parcelName}</strong></td>
                          <td>{e.householdName}</td>
                          <td>{e.cropType}</td>
                          <td>{e.areaHa != null ? number(e.areaHa) : '—'}</td>
                          <td>{when ? date(when) : '—'}</td>
                          <td>{e.estimatedYieldKg ? number(e.estimatedYieldKg) : '—'}</td>
                          <td><Pill tone={state.tone}>{state.label}</Pill></td>
                          <td><button type="button" className={ui.small} aria-label={`Xem ${e.parcelName}`} onClick={() => openCalendar(dayStart(when ?? new Date().toISOString()))}><Eye size={14} aria-hidden="true" />Xem</button></td>
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
      )}
    </div>
  )
}
