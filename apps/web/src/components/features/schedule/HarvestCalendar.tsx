// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState, useMemo } from 'react'
import useSWR from 'swr'
import { Calendar, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle, ShieldAlert } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import kit from '@/components/features/dashboard/page-kit.module.css'
import styles from './HarvestCalendar.module.css'
import { FarmerScheduleAside } from './FarmerScheduleAside'
import { DayPanel } from './DayPanel'
import farmer from '@/components/features/farmer-web/kit.module.css'
import { Button } from '@/components/ui/Button/Button'

export interface HarvestEvent {
  cycleId: string
  parcelId: string
  parcelName: string | null
  householdName: string
  cropType: string
  estimatedYieldKg: number | null
  estimatedHarvestDate: string | null
  safeHarvestDate: string | null
  status: 'SAFE' | 'WARNING' | 'DANGER'
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export function HarvestCalendar({ userRole }: { userRole: 'MANAGER' | 'OFFICER' | 'FARMER' }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedEvent, setSelectedEvent] = useState<HarvestEvent | null>(null)
  const [newDateStr, setNewDateStr] = useState('')

  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [selectedUnscheduledCycleId, setSelectedUnscheduledCycleId] = useState('')
  const [newAddDateStr, setNewAddDateStr] = useState('')

  // First day of month, last day of month
  const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
  const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)

  const startDateIso = firstDay.toISOString()
  const endDateIso = lastDay.toISOString()

  const isManager = userRole === 'MANAGER'
  const isFarmer = userRole === 'FARMER'

  const { data, mutate } = useSWR<{ data: HarvestEvent[] }>(
    `/api/schedule/harvest?start_date=${startDateIso}&end_date=${endDateIso}`,
    fetcher
  )

  const { data: unscheduledData, mutate: mutateUnscheduled } = useSWR<{ data: HarvestEvent[] }>(
    isManager ? '/api/schedule/unscheduled' : null,
    fetcher
  )

  const events = data?.data ?? []
  const eventsOn = (date: Date) => events.filter(ev => ev.estimatedHarvestDate && new Date(ev.estimatedHarvestDate).toDateString() === date.toDateString())
  const todayKey = new Date().toDateString()

  // Đổi tháng thì khung bên phải theo sang tháng đó: tháng hiện tại chọn hôm nay, tháng khác chọn mùng 1
  const showMonth = (year: number, month: number) => {
    const first = new Date(year, month, 1)
    const now = new Date()
    setCurrentDate(first)
    setSelectedDate(now.getFullYear() === first.getFullYear() && now.getMonth() === first.getMonth() ? now : first)
  }
  const handlePrevMonth = () => showMonth(currentDate.getFullYear(), currentDate.getMonth() - 1)
  const handleNextMonth = () => showMonth(currentDate.getFullYear(), currentDate.getMonth() + 1)
  const handleToday = () => showMonth(new Date().getFullYear(), new Date().getMonth())

  // yyyy-mm-dd theo giờ máy, cho ô nhập ngày
  const toInputDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const addOnSelectedDay = () => {
    setNewAddDateStr(toInputDate(selectedDate))
    setIsAddModalOpen(true)
  }

  const handleEventClick = (event: HarvestEvent) => {
    if (!isManager) return
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

  const daysInMonth = lastDay.getDate()
  const startDayOfWeek = firstDay.getDay() // 0 = Sunday
  const daysArray = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth])
  const emptyDays = useMemo(() => Array.from({ length: startDayOfWeek }, (_, i) => i), [startDayOfWeek])
  const trailingDays = (7 - ((startDayOfWeek + daysInMonth) % 7)) % 7

  return (
    <div className={kit.page}>
      <PageHeader
        icon={<Calendar size={28} />}
        title={isFarmer ? 'Lịch dự kiến thu hoạch' : 'Lịch thu hái'}
        description={isFarmer ? 'Ngày hái dự kiến từng thửa — màu cho biết đã đủ thời gian cách ly hay chưa' : isManager ? 'Lên kế hoạch thu hoạch cho các vùng chè của hợp tác xã.' : 'Lịch dự kiến thu hoạch theo thửa, có cảnh báo thời gian cách ly'}
        actions={isManager ? <Button onClick={() => setIsAddModalOpen(true)}>+ Thêm lịch</Button> : undefined}
      />

      <div className={styles.layout}>
        <div className={styles.calendarContainer}>
          <div className={styles.header}>
            <button type="button" className={styles.nav} onClick={handlePrevMonth} aria-label="Tháng trước"><ChevronLeft size={18} aria-hidden="true" /></button>
            <h2 className={styles.title}>Tháng {currentDate.getMonth() + 1}, {currentDate.getFullYear()}</h2>
            <button type="button" className={styles.nav} onClick={handleNextMonth} aria-label="Tháng sau"><ChevronRight size={18} aria-hidden="true" /></button>
            <button type="button" className={styles.todayButton} onClick={handleToday}>Hôm nay</button>
          </div>

          <div className={styles.gridScroll}>
            <div className={styles.grid}>
              {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map(day => (
                <div key={day} className={styles.dayHeader}>{day}</div>
              ))}

              {emptyDays.map(empty => (
                <div key={`empty-${empty}`} className={`${styles.cell} ${styles.blank}`} />
              ))}

              {daysArray.map(day => {
                const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day)
                const isToday = date.toDateString() === todayKey
                const isSelected = date.toDateString() === selectedDate.toDateString()

                return (
                  <div
                    key={day}
                    className={`${styles.cell} ${isToday ? styles.today : ''} ${isSelected ? styles.selected : ''}`}
                    onClick={() => setSelectedDate(date)}
                  >
                    <button type="button" className={styles.cellDate} aria-pressed={isSelected} aria-label={`Ngày ${day}/${date.getMonth() + 1}`}>{day}</button>
                    <div className="flex flex-col gap-1 overflow-y-auto">
                      {eventsOn(date).map(ev => (
                        <div
                          key={ev.cycleId}
                          onClick={() => handleEventClick(ev)}
                          className={`
                            ${styles.event}
                            ${isManager ? styles.eventInteractive : ''}
                            ${ev.status === 'SAFE' ? styles.eventSafe : ''}
                            ${ev.status === 'WARNING' ? styles.eventWarning : ''}
                            ${ev.status === 'DANGER' ? styles.eventDanger : ''}
                          `}
                          title={`Thửa: ${ev.parcelName}\nGiống: ${ev.cropType}\nHộ: ${ev.householdName}\nSL dự kiến: ${ev.estimatedYieldKg || 0} kg`}
                        >
                          {ev.status === 'SAFE' && <CheckCircle size={12} aria-hidden="true" />}
                          {ev.status === 'WARNING' && <AlertTriangle size={12} aria-hidden="true" />}
                          {ev.status === 'DANGER' && <ShieldAlert size={12} aria-hidden="true" />}
                          <span className="truncate">{ev.parcelName || 'N/A'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}

              {Array.from({ length: trailingDays }, (_, i) => (
                <div key={`after-${i}`} className={`${styles.cell} ${styles.blank}`} />
              ))}
            </div>
          </div>
        </div>

        <DayPanel
          date={selectedDate}
          events={eventsOn(selectedDate)}
          onAdd={isManager ? addOnSelectedDay : undefined}
          onEdit={isManager ? handleEventClick : undefined}
        />
      </div>

      {isFarmer && <div className={styles.below}><FarmerScheduleAside /></div>}
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
                <label className="text-sm font-medium">Chọn thửa ruộng (đang canh tác)</label>
                <select
                  className="border p-2 rounded-md"
                  value={selectedUnscheduledCycleId}
                  onChange={(e) => setSelectedUnscheduledCycleId(e.target.value)}
                >
                  <option value="">-- Chọn thửa ruộng --</option>
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
