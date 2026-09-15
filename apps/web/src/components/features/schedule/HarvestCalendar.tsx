// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState, useMemo } from 'react'
import useSWR from 'swr'
import { Calendar, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle, Edit2, ShieldAlert } from 'lucide-react'
import styles from './HarvestCalendar.module.css'
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

  const { data, mutate } = useSWR<{ data: HarvestEvent[] }>(
    `/api/schedule/harvest?start_date=${startDateIso}&end_date=${endDateIso}`,
    fetcher
  )

  const { data: unscheduledData, mutate: mutateUnscheduled } = useSWR<{ data: HarvestEvent[] }>(
    isManager ? '/api/schedule/unscheduled' : null,
    fetcher
  )

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
    <div className={styles.calendarContainer}>
      <div className={styles.header}>
        <div className="flex items-center gap-2">
          <Calendar className="w-6 h-6 text-primary" />
          <h2 className={styles.title}>Lịch Dự Kiến Thu Hoạch</h2>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-medium">
            Tháng {currentDate.getMonth() + 1} / {currentDate.getFullYear()}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handlePrevMonth} aria-label="Tháng trước"><ChevronLeft size={16} /></Button>
            <Button variant="secondary" onClick={handleNextMonth} aria-label="Tháng sau"><ChevronRight size={16} /></Button>
            {isManager && (
              <Button onClick={() => setIsAddModalOpen(true)}>+ Thêm lịch</Button>
            )}
          </div>
        </div>
      </div>

      <div className={styles.grid}>
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
            <div key={day} className={styles.cell}>
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
                    <span className="truncate">{ev.parcelName || 'N/A'} - {ev.cropType}</span>
                    {isManager && <Edit2 size={10} className="ml-auto opacity-50" aria-hidden="true" />}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Edit Modal */}
      {selectedEvent && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h3 className="text-lg font-bold">Điều chỉnh ngày thu hoạch</h3>
            <p className="text-sm text-gray-500">
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
                <p className="text-xs text-orange-600 flex items-center gap-1 mt-1">
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
