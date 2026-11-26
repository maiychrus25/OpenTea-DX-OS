// SPDX-License-Identifier: MIT
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState } from 'react'
import useSWR from 'swr'
import { ShieldCheck } from 'lucide-react'
import kit from '@/components/features/farmer-web/kit.module.css'
import type { HarvestEvent } from './HarvestCalendar'

const STATUS = {
  SAFE: { tag: 'An toàn', tone: 'soft', legend: 'Đã hết thời gian cách ly, hái được', note: 'Đã hết cách ly' },
  WARNING: { tag: 'Cảnh báo', tone: 'amber', legend: 'Sắp hết thời gian cách ly', note: 'Sắp hết cách ly' },
  DANGER: { tag: 'Nguy hiểm', tone: 'bd', legend: 'Còn cách ly, chưa được hái', note: 'Còn cách ly' },
} as const

const dayMonth = (date: string) => new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })

/** Colour legend and the farmer's next harvests, whichever month the calendar shows. */
export function FarmerScheduleAside() {
  // Fixed once, so the request key does not change on every render.
  const [url] = useState(() => {
    const from = new Date()
    from.setHours(0, 0, 0, 0)
    const to = new Date(from)
    to.setDate(to.getDate() + 90)
    return `/api/schedule/harvest?start_date=${from.toISOString()}&end_date=${to.toISOString()}`
  })
  const { data } = useSWR<{ data?: HarvestEvent[] }>(url, (key: string) => fetch(key).then(res => res.json()))
  const upcoming = (data?.data ?? [])
    .filter(event => event.estimatedHarvestDate)
    .sort((a, b) => a.estimatedHarvestDate!.localeCompare(b.estimatedHarvestDate!))
    .slice(0, 3)

  return (
    <div className={kit.stack} style={{ flex: '1 1 300px' }}>
      <section className={kit.pn} aria-label="Chú thích">
        <div className={kit.ph}><h2>Chú thích</h2></div>
        <ul className={kit.list} style={{ padding: '8px 0' }}>
          {Object.values(STATUS).map(item => (
            <li key={item.tag} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 18px', fontSize: 13.5 }}>
              <span className={`${kit.tag} ${kit[item.tone]}`}>{item.tag}</span>{item.legend}
            </li>
          ))}
        </ul>
      </section>
      <section className={kit.pn} aria-label="Lần hái sắp tới">
        <div className={kit.ph}><h2>Lần hái sắp tới</h2></div>
        {upcoming.length === 0 ? (
          <p className={kit.muted} style={{ margin: 0, padding: 18, fontSize: 13.5 }}>Chưa có lịch thu hái trong 90 ngày tới.</p>
        ) : (
          <ul className={kit.list}>
            {upcoming.map(event => (
              <li key={event.cycleId} className={kit.row} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <strong className={kit.grow}>{event.parcelName} · {event.cropType}</strong>
                  <span className={`${kit.tag} ${kit.mu}`}>{dayMonth(event.estimatedHarvestDate!)}</span>
                </span>
                {event.estimatedYieldKg ? <span className={kit.muted}>Dự kiến {event.estimatedYieldKg.toLocaleString('vi-VN')} kg</span> : null}
                <span className={`${kit.tag} ${kit[STATUS[event.status].tone]}`} style={{ alignSelf: 'flex-start' }}>
                  {event.status === 'DANGER' && event.safeHarvestDate ? `Còn cách ly đến ${dayMonth(event.safeHarvestDate)}` : STATUS[event.status].note}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className={kit.note}>
        <ShieldCheck size={20} aria-hidden="true" />
        <span>Lịch do Trưởng HTX sắp xếp. Cần đổi ngày hái, bạn nhắn cán bộ kỹ thuật.</span>
      </div>
    </div>
  )
}
