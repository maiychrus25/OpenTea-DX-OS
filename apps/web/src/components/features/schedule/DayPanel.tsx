// SPDX-License-Identifier: MIT
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React from 'react'
import { Calendar } from 'lucide-react'
import styles from './HarvestCalendar.module.css'
import type { HarvestEvent } from './HarvestCalendar'

const STATUS_NOTE = { SAFE: 'Đã hết cách ly', WARNING: 'Sắp hết cách ly', DANGER: 'Còn cách ly' } as const

interface Props {
  date: Date
  events: HarvestEvent[]
  /** Only the manager can schedule and reschedule. */
  onAdd?: () => void
  onEdit?: (event: HarvestEvent) => void
}

export function DayPanel({ date, events, onAdd, onEdit }: Props) {
  const weekday = date.toLocaleDateString('vi-VN', { weekday: 'long' })
  const dayText = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })

  return (
    <section className={styles.panel} aria-label="Lịch trong ngày">
      <div className={styles.panelHead}>
        <h2>Lịch trong ngày</h2>
        <p>{weekday}, {dayText}</p>
      </div>
      {events.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}><Calendar size={52} aria-hidden="true" /></span>
          <h3>Chưa có lịch thu hái</h3>
          <p>Ngày này chưa có kế hoạch thu hoạch.</p>
          {onAdd && <button type="button" className={styles.outline} onClick={onAdd}>+ Thêm lịch cho ngày này</button>}
        </div>
      ) : (
        <>
          <ul className={styles.dayList}>
            {events.map(ev => (
              <li key={ev.cycleId}>
                <strong>{ev.parcelName || 'N/A'} · {ev.cropType}</strong>
                <span>{ev.householdName}{ev.estimatedYieldKg ? ` · dự kiến ${ev.estimatedYieldKg.toLocaleString('vi-VN')} kg` : ''}</span>
                <span>{STATUS_NOTE[ev.status]}</span>
                {onEdit && <button type="button" className={styles.outline} onClick={() => onEdit(ev)}>Đổi ngày</button>}
              </li>
            ))}
          </ul>
          {onAdd && <button type="button" className={styles.outline} onClick={onAdd}>+ Thêm lịch cho ngày này</button>}
        </>
      )}
    </section>
  )
}
