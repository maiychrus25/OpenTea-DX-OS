// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState, useMemo } from 'react'
import useSWR from 'swr'
import { Calendar, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle, Edit2, ShieldAlert } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import kit from '@/components/features/dashboard/page-kit.module.css'
import styles from './HarvestCalendar.module.css'
import { FarmerScheduleAside } from './FarmerScheduleAside'
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

  const todayKey = new Date().toDateString()
  const todayEvents = (data?.data ?? []).filter(ev => ev.estimatedHarvestDate && new Date(ev.estimatedHarvestDate).toDateString() === todayKey)

  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))

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

  return (
    <div className={kit.page}>
      <PageHeader
        icon={<Calendar size={28} />}
        title={isFarmer ? 'Lịch dự kiến thu hoạch' : 'Lịch thu hái'}
        description={isFarmer ? 'Ngày hái dự kiến từng thửa — màu cho biết đã đủ thời gian cách ly hay chưa' : 'Lịch dự kiến thu hoạch theo thửa, có cảnh báo thời gian cách ly'}
        actions={isManager ? <Button onClick={() => setIsAddModalOpen(true)}>+ Thêm lịch</Button> : isFarmer ? (
          <div className="flex gap-2 items-center">
            <h2 className={styles.month}>Tháng {currentDate.getMonth() + 1} / {currentDate.getFullYear()}</h2>
            <Button variant="secondary" onClick={handlePrevMonth} aria-label="Tháng trước"><ChevronLeft size={16} /></Button>
            <Button variant="secondary" onClick={handleNextMonth} aria-label="Tháng sau"><ChevronRight size={16} /></Button>
          </div>
        ) : undefined}
      />

      <div className={isFarmer || isManager ? farmer.cols : undefined}>
      <div className={`${styles.calendarContainer} ${isFarmer || isManager ? styles.beside : ''}`}>
      {!isFarmer && <div className={styles.header}>
        <h2 className={styles.title}>
          Tháng {currentDate.getMonth() + 1} / {currentDate.getFullYear()}
        </h2>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handlePrevMonth} aria-label="Tháng trước"><ChevronLeft size={16} /></Button>
          <Button variant="secondary" onClick={handleNextMonth} aria-label="Tháng sau"><ChevronRight size={16} /></Button>
        </div>
      </div>}

      <div className={styles.gridScroll}>
      <div className={`${styles.grid} ${isFarmer ? styles.farmerGrid : ''}`}>
        {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map(day => (
          <div key={day} className={styles.dayHeader}>{day}</div>
        ))}
        
        {emptyDays.map(empty => (
          <div key={`empty-${empty}`} className={styles.cell} />
        ))}

        {daysArray.map(day => {
          const eventsForDay = data?.data?.filter(ev => {
            if (!ev.estimatedHarvestDate) return false
            const evDate = new Date(ev.estimatedHarvestDate)
            return evDate.getDate() === day && evDate.getMonth() === currentDate.getMonth() && evDate.getFullYear() === currentDate.getFullYear()
          }) || []

          return (
            <div key={day} className={`${styles.cell} ${isFarmer && new Date(currentDate.getFullYear(), currentDate.getMonth(), day).toDateString() === new Date().toDateString() ? styles.today : ''}`}>
              <div className={styles.cellDate}>{day}</div>
              <div className="flex flex-col gap-1 overflow-y-auto">
                {eventsForDay.map(ev => (
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
                    title={`Thửa: ${ev.parcelName}\nHộ: ${ev.householdName}\nSL dự kiến: ${ev.estimatedYieldKg || 0} kg`}
                  >
                    {ev.status === 'SAFE' && <CheckCircle size={12} aria-hidden="true" />}
                    {ev.status === 'WARNING' && <AlertTriangle size={12} aria-hidden="true" />}
                    {ev.status === 'DANGER' && <ShieldAlert size={12} aria-hidden="true" />}
                    <span className="truncate">{ev.parcelName || 'N/A'}{isFarmer ? '' : ` - ${ev.cropType}`}</span>
                    {isManager && <Edit2 size={10} className="ml-auto opacity-50" aria-hidden="true" />}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      </div>
      </div>
      {isFarmer && <FarmerScheduleAside />}
      {isManager && (
        <div className={farmer.stack} style={{ flex: '1 1 280px' }}>
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
          <section className={farmer.pn} aria-label="Lịch trong ngày">
            <div className={farmer.ph}><h2>Lịch trong ngày</h2></div>
            {todayEvents.length === 0 ? (
              <p className={farmer.muted} style={{ margin: 0, padding: 18, fontSize: 13.5 }}>Hôm nay chưa có lịch thu hái.</p>
            ) : (
              <ul className={farmer.list}>
                {todayEvents.map(ev => <li key={ev.cycleId} className={farmer.row}><strong>{ev.parcelName}</strong> <span className={farmer.muted}>{ev.householdName} · {ev.cropType}</span></li>)}
              </ul>
            )}
          </section>
        </div>
      )}
      </div>

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
