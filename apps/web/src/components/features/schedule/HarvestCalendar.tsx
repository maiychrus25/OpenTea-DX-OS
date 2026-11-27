// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState } from 'react'
import useSWR from 'swr'
import { AlertTriangle, Ban, Check, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, Leaf, Plus } from 'lucide-react'
import kit from '@/components/features/dashboard/page-kit.module.css'
import farmer from '@/components/features/farmer-web/kit.module.css'
import styles from './HarvestCalendar.module.css'
import { Button } from '@/components/ui/Button/Button'
import type { HarvestEvent } from '@/domain/farm/entities/HarvestEvent'
import { addDays, dayStart, spansOf, weekBars, weeksOf, type SpanKind } from './calendar-model'

const fetcher = (url: string) => fetch(url).then((res) => res.json())

const KIND: Record<SpanKind, { label: string; icon: typeof Leaf }> = {
  quarantine: { label: 'Cách ly', icon: Ban },
  blocked: { label: 'Hẹn hái khi còn cách ly', icon: AlertTriangle },
  ready: { label: 'Được hái', icon: Leaf },
  harvested: { label: 'Đã hái', icon: Check },
}

const ACTIVITY: Record<string, string> = {
  SOWING: 'Gieo trồng', FERTILIZING: 'Bón phân', SPRAYING: 'Phun thuốc BVTV', IRRIGATION: 'Tưới tiêu', HARVEST: 'Thu hoạch', PRUNING: 'Đốn chè', OTHER: 'Khác',
}

const fullDay = (value: number | string) => new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })

export function HarvestCalendar({ userRole }: { userRole: 'MANAGER' | 'OFFICER' | 'FARMER' }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [selectedDay, setSelectedDay] = useState(() => dayStart(new Date()))
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<HarvestEvent | null>(null)
  const [newDateStr, setNewDateStr] = useState('')

  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [selectedUnscheduledCycleId, setSelectedUnscheduledCycleId] = useState('')
  const [newAddDateStr, setNewAddDateStr] = useState('')

  const isManager = userRole === 'MANAGER'
  const weeks = weeksOf(month.getFullYear(), month.getMonth())
  // A withdrawal period may start before the grid or end after it, so a month is read on both sides.
  const from = new Date(addDays(weeks[0][0], -31)).toISOString()
  const to = new Date(addDays(weeks[weeks.length - 1][6], 32) - 1).toISOString()

  const { data, mutate } = useSWR<{ data: HarvestEvent[] }>(`/api/schedule/harvest?start_date=${from}&end_date=${to}`, fetcher)
  const { data: unscheduledData, mutate: mutateUnscheduled } = useSWR<{ data: HarvestEvent[] }>(isManager ? '/api/schedule/unscheduled' : null, fetcher)

  const events = data?.data ?? []
  const spans = spansOf(events)
  const today = dayStart(new Date())
  const monthStart = month.getTime()
  const monthEnd = dayStart(new Date(month.getFullYear(), month.getMonth() + 1, 0))
  const inMonth = (value: string | null | undefined) => !!value && dayStart(value) >= monthStart && dayStart(value) <= monthEnd
  const stats = [
    { label: 'Lứa trong tháng', value: events.filter(e => inMonth(e.estimatedHarvestDate)).length, icon: Leaf, tone: styles.green },
    { label: 'Thửa cách ly', value: new Set(spans.filter(x => x.kind === 'quarantine' && x.to >= monthStart && x.from <= monthEnd).map(x => x.event.parcelId)).size, icon: Ban, tone: styles.red },
    { label: 'Lứa đã hái', value: events.filter(e => inMonth(e.harvestedAt)).length, icon: CircleCheck, tone: styles.green },
  ]

  const dayItems = spans.filter(x => x.from <= selectedDay && x.to >= selectedDay)
  const selected = dayItems.find(x => x.key === selectedKey) ?? dayItems[0] ?? null
  const unsafe = dayItems.some(x => x.kind === 'quarantine' || x.kind === 'blocked')

  /** Another month shows today when it is the current one, otherwise its first day. */
  const showMonth = (year: number, index: number) => {
    const first = new Date(year, index, 1)
    const now = new Date()
    setMonth(first)
    setSelectedDay(now.getFullYear() === first.getFullYear() && now.getMonth() === first.getMonth() ? dayStart(now) : first.getTime())
  }
  const choose = (day: number, key: string | null = null) => { setSelectedDay(day); setSelectedKey(key) }

  // yyyy-mm-dd theo giờ máy, cho ô nhập ngày
  const toInputDate = (time: number) => {
    const date = new Date(time)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
  const addOnSelectedDay = () => {
    setNewAddDateStr(toInputDate(selectedDay))
    setIsAddModalOpen(true)
  }
  const edit = (event: HarvestEvent) => {
    setSelectedEvent(event)
    setNewDateStr(event.estimatedHarvestDate ? event.estimatedHarvestDate.split('T')[0] : '')
  }

  const handleUpdateDate = async () => {
    if (!selectedEvent || !newDateStr) return
    try {
      const res = await fetch(`/api/schedule/harvest/${selectedEvent.cycleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estimated_harvest_date: new Date(newDateStr).toISOString() }),
      })
      if (res.ok) {
        mutate() // Refresh data
        mutateUnscheduled()
        setSelectedEvent(null)
      } else {
        alert('Lỗi cập nhật ngày thu hoạch')
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleAssignNewDate = async () => {
    if (!selectedUnscheduledCycleId || !newAddDateStr) return
    try {
      const res = await fetch(`/api/schedule/harvest/${selectedUnscheduledCycleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estimated_harvest_date: new Date(newAddDateStr).toISOString() }),
      })
      if (res.ok) {
        mutate()
        mutateUnscheduled()
        setIsAddModalOpen(false)
        setSelectedUnscheduledCycleId('')
        setNewAddDateStr('')
      } else {
        alert('Lỗi thêm lịch thu hoạch')
      }
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className={`${kit.page} ${styles.page}`}>
      <div className={styles.top}>
        <div>
          <h1>Lịch thu hái</h1>
          <p>Theo dõi ngày hái của từng thửa, tránh thu hái trong thời gian cách ly.</p>
        </div>
        {isManager && <Button onClick={() => setIsAddModalOpen(true)}><Plus size={16} aria-hidden="true" />Thêm lứa hái</Button>}
      </div>

      <div className={styles.layout}>
        <div className={styles.main}>
          <dl className={styles.stats}>
            {stats.map(({ label, value, icon: Icon, tone }) => (
              <div key={label}>
                <span className={tone}><Icon size={20} aria-hidden="true" /></span>
                <dd>{value}</dd>
                <dt>{label}</dt>
              </div>
            ))}
          </dl>

          <div className={styles.calendar}>
            <div className={styles.header}>
              <button type="button" className={styles.nav} onClick={() => showMonth(month.getFullYear(), month.getMonth() - 1)} aria-label="Tháng trước"><ChevronLeft size={16} aria-hidden="true" /></button>
              <h2>Tháng {month.getMonth() + 1}, {month.getFullYear()}</h2>
              <button type="button" className={styles.nav} onClick={() => showMonth(month.getFullYear(), month.getMonth() + 1)} aria-label="Tháng sau"><ChevronRight size={16} aria-hidden="true" /></button>
              <button type="button" className={styles.todayButton} onClick={() => showMonth(new Date().getFullYear(), new Date().getMonth())}>Hôm nay</button>
              <ul className={styles.legend} aria-label="Chú thích">
                <li><i className={styles.ready} />Được hái</li>
                <li><i className={styles.quarantine} />Cách ly</li>
                <li><i className={styles.harvested} />Đã hái</li>
              </ul>
            </div>

            <div className={styles.scroll}>
              <div className={styles.grid}>
                <div className={styles.weekdays}>
                  {['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'].map(day => <span key={day}>{day}</span>)}
                </div>
                {weeks.map(week => {
                  const bars = weekBars(week, spans)
                  const rows = Math.max(0, ...bars.map(bar => bar.row)) + 1
                  return (
                  <div key={week[0]} className={styles.week}>
                    {week.map((day, index) => {
                      const date = new Date(day)
                      return (
                        <div key={day} style={{ gridColumn: index + 1, gridRow: `1 / span ${rows}` }}
                          className={`${styles.cell} ${date.getMonth() !== month.getMonth() ? styles.outside : ''} ${day === selectedDay ? styles.selected : ''}`}
                          onClick={() => choose(day)}>
                          <button type="button" className={`${styles.date} ${day === today ? styles.today : ''}`} aria-pressed={day === selectedDay} aria-label={`Ngày ${date.getDate()}/${date.getMonth() + 1}`}>{date.getDate()}</button>
                        </div>
                      )
                    })}
                    {bars.map(({ span, column, width, row }) => {
                      const Icon = KIND[span.kind].icon
                      return (
                        <button key={span.key} type="button" className={`${styles.bar} ${styles[span.kind]}`}
                          style={{ gridColumn: `${column} / span ${width}`, gridRow: row + 1 }}
                          title={`${span.event.parcelName} · ${KIND[span.kind].label}`}
                          onClick={() => choose(Math.max(span.from, week[0]), span.key)}>
                          <Icon size={12} aria-hidden="true" />
                          <span>{span.event.parcelName}</span>
                        </button>
                      )
                    })}
                  </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        <section className={styles.panel} aria-label="Chi tiết ngày">
          <h2>Chi tiết ngày {fullDay(selectedDay)}</h2>
          {unsafe && (
            <p className={styles.warning}><CircleAlert size={18} aria-hidden="true" />Có thửa đang trong thời gian cách ly, không được thu hái.</p>
          )}
          <h3>Lịch thu hái trong ngày</h3>
          {dayItems.length === 0 ? (
            <p className={styles.muted}>Ngày này chưa có lịch thu hoạch.</p>
          ) : (
            <ul className={styles.items}>
              {dayItems.map(item => {
                const Icon = KIND[item.kind].icon
                return (
                  <li key={item.key}>
                    <button type="button" className={styles[item.kind]} aria-pressed={item.key === selected?.key} onClick={() => setSelectedKey(item.key)}>
                      <Icon size={16} aria-hidden="true" />
                      <strong>{item.event.parcelName}</strong>
                      <span>{KIND[item.kind].label}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {selected && (
            <>
              <h3>Thông tin lứa {selected.event.parcelName}</h3>
              <dl className={styles.rows}>
                <div><dt>Nông hộ</dt><dd>{selected.event.householdName}</dd></div>
                <div><dt>Giống chè</dt><dd>{selected.event.cropType}</dd></div>
                {selected.event.estimatedHarvestDate && <div><dt>Ngày hái dự kiến</dt><dd>{fullDay(selected.event.estimatedHarvestDate)}</dd></div>}
                {selected.event.estimatedYieldKg ? <div><dt>Sản lượng dự kiến</dt><dd>{selected.event.estimatedYieldKg.toLocaleString('vi-VN')} kg</dd></div> : null}
                {selected.event.treatment && (
                  <>
                    <div><dt>Loại xử lý</dt><dd>{ACTIVITY[selected.event.treatment.activity] ?? selected.event.treatment.activity}{selected.event.treatment.product ? ` · ${selected.event.treatment.product}` : ''}</dd></div>
                    {selected.event.treatment.date && <div><dt>Ngày xử lý</dt><dd>{fullDay(selected.event.treatment.date)}</dd></div>}
                    {selected.event.treatment.withdrawalDays != null && <div><dt>Thời gian cách ly</dt><dd>{selected.event.treatment.withdrawalDays} ngày</dd></div>}
                  </>
                )}
                {selected.event.safeHarvestDate && <div><dt>Ngày được hái</dt><dd>{fullDay(selected.event.safeHarvestDate)}</dd></div>}
              </dl>
              {isManager && !selected.event.harvestedAt && <Button variant="secondary" onClick={() => edit(selected.event)}>Đổi ngày</Button>}
            </>
          )}
          {isManager && <Button variant="secondary" onClick={addOnSelectedDay}>+ Thêm lứa hái cho ngày này</Button>}
        </section>
      </div>

      {isManager && (
        <section className={farmer.pn} aria-label="Chưa xếp lịch">
          <div className={farmer.ph}>
            <h2>Chưa xếp lịch</h2>
            <span className={`${farmer.tag} ${farmer.wt}`}>{unscheduledData?.data?.length ?? 0} thửa</span>
          </div>
          {!unscheduledData?.data?.length ? (
            <p className={farmer.muted} style={{ margin: 0, padding: 18, fontSize: 13.5 }}>Thửa nào cũng đã có lịch.</p>
          ) : (
            <ul className={farmer.list}>
              {unscheduledData.data.map(cycle => (
                <li key={cycle.cycleId} className={farmer.row}>
                  <span className={farmer.grow}>
                    <strong>{cycle.parcelName} · {cycle.householdName}</strong>
                    <br />
                    <span className={farmer.muted}>{cycle.cropType}</span>
                  </span>
                  <button type="button" className={farmer.btn2} aria-label={`Xếp lịch cho ${cycle.parcelName}`} onClick={() => { setSelectedUnscheduledCycleId(cycle.cycleId); setIsAddModalOpen(true) }}>
                    Xếp lịch
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Edit Modal */}
      {selectedEvent && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h3 className="text-lg font-bold">Điều chỉnh ngày thu hoạch</h3>
            <p className="text-sm text-ink-tertiary">
              Thửa: {selectedEvent.parcelName} - Hộ: {selectedEvent.householdName}
            </p>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Ngày dự kiến mới</label>
              <input
                type="date"
                value={newDateStr}
                onChange={(e) => setNewDateStr(e.target.value)}
                className="border p-2 rounded-md"
              />
              {selectedEvent.safeHarvestDate && (
                <p className="text-xs text-accent flex items-center gap-1 mt-1">
                  <AlertTriangle size={12} aria-hidden="true" /> Ngày an toàn: {new Date(selectedEvent.safeHarvestDate).toLocaleDateString()}
                </p>
              )}
            </div>
            <div className={styles.modalActions}>
              <Button variant="secondary" onClick={() => setSelectedEvent(null)}>Hủy</Button>
              <Button onClick={handleUpdateDate}>Cập nhật</Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {isAddModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h3 className="text-lg font-bold">Thêm lịch thu hoạch mới</h3>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Chọn nương chè (đang canh tác)</label>
                <select
                  className="border p-2 rounded-md"
                  value={selectedUnscheduledCycleId}
                  onChange={(e) => setSelectedUnscheduledCycleId(e.target.value)}
                >
                  <option value="">-- Chọn nương chè --</option>
                  {unscheduledData?.data?.map(cycle => (
                    <option key={cycle.cycleId} value={cycle.cycleId}>
                      {cycle.parcelName} - Hộ: {cycle.householdName} ({cycle.cropType})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Ngày dự kiến thu hoạch</label>
                <input
                  type="date"
                  value={newAddDateStr}
                  onChange={(e) => setNewAddDateStr(e.target.value)}
                  className="border p-2 rounded-md"
                />
              </div>
            </div>
            <div className={styles.modalActions}>
              <Button variant="secondary" onClick={() => setIsAddModalOpen(false)}>Hủy</Button>
              <Button onClick={handleAssignNewDate} disabled={!selectedUnscheduledCycleId || !newAddDateStr}>Lưu lịch</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
