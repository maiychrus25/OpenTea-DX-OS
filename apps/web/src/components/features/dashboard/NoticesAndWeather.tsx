// SPDX-License-Identifier: MIT
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect, useState } from 'react'
import { EmptyState, Panel } from '@/components/ui'
import { Bell, CloudRain } from 'lucide-react'
import { weatherCodeToCondition } from '@/infrastructure/external/open-meteo-adapter'
import layout from './dashboard.module.css'

interface Notice { id: string; title: string; detail: string; created_at: string }
interface Day { date: string; code: number; min: number; max: number; rainChance: number }

const dayLabel = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })

async function load<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url)
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

/** The newest notices and the coming days' weather where the parcels are. */
export function NoticesAndWeather() {
  const [notices, setNotices] = useState<Notice[]>([])
  const [days, setDays] = useState<Day[]>([])
  const [area, setArea] = useState('')

  useEffect(() => {
    void load<{ data?: { notifications?: Notice[] } }>('/api/notifications?limit=4').then((json) => setNotices(json?.data?.notifications ?? []))
    void load<{ area?: string; data?: { weather: { daily: Day[] } }[] }>('/api/weather/live').then((json) => {
      setDays(json?.data?.[0]?.weather.daily.slice(0, 5) ?? [])
      setArea(json?.area ?? '')
    })
  }, [])

  const rainy = days.find((d, i) => i < 2 && d.rainChance >= 70)

  return (
    <>
      {rainy && (
        <p role="status" style={{ margin: 0, padding: '12px 18px', borderRadius: 'var(--radius-card)', background: 'var(--color-warning-subtle)', color: 'var(--color-warning)', fontSize: 14 }}>
          Dự báo mưa {dayLabel(rainy.date)} (khả năng {rainy.rainChance}%). Nên hoãn phun thuốc.
        </p>
      )}
      <div className={layout.columns}>
        <Panel title="Bản tin & thông báo" href="/manager/notifications">
          {notices.length === 0 ? (
            <EmptyState icon={<Bell />} title="Chưa có thông báo nào" />
          ) : (
            <div className={layout.tableWrap}>
              <table className={layout.table}>
                <tbody>
                  {notices.map((n) => (
                    <tr key={n.id}>
                      <td><strong>{n.title}</strong><br />{n.detail}</td>
                      <td>{new Date(n.created_at).toLocaleDateString('vi-VN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title={area ? `Thời tiết vùng trồng · ${area}` : 'Thời tiết vùng trồng'} href="/manager/bulletin" linkLabel="Chi tiết">
          {days.length === 0 ? (
            <EmptyState icon={<CloudRain />} title="Chưa lấy được dự báo thời tiết" />
          ) : (
            <div className={layout.tableWrap}>
              <table className={layout.table}>
                <thead>
                  <tr><th>Ngày</th><th>Thời tiết</th><th>Nhiệt độ</th><th>Mưa</th></tr>
                </thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={d.date}>
                      <td>{dayLabel(d.date)}</td>
                      <td>{weatherCodeToCondition(d.code)}</td>
                      <td>{Math.round(d.min)}–{Math.round(d.max)}°C</td>
                      <td>{d.rainChance}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  )
}
