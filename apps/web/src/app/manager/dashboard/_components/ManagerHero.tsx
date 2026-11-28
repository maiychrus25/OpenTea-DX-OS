// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import { Droplet, MapPin, Wind } from 'lucide-react'
import { WeatherIcon } from '@/components/features/bulletin/WeatherSection'
import { weatherCodeToCondition } from '@/infrastructure/external/open-meteo-adapter'
import styles from './overview.module.css'

interface Now { area: string; temperature: number; humidity: number; windSpeed: number; code: number; isDay?: boolean }

/** The photo banner with the greeting and the weather over the parcels. */
export function ManagerHero({ htxName, greeting }: { htxName: string; greeting: string }) {
  const [now, setNow] = useState<Now | null>(null)

  useEffect(() => {
    let gone = false
    fetch('/api/weather/live', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const current = json?.data?.[0]?.weather.current
        if (!gone && current) setNow({ ...current, area: json.area ?? '' })
      })
      .catch(() => undefined)
    return () => { gone = true }
  }, [])

  return (
    <header className={styles.hero}>
      <div>
        <p className={styles.eyebrow}>{htxName}</p>
        <h1>{greeting}</h1>
        <p className={styles.lead}>Cùng quản lý sản xuất, chế biến và tiêu thụ chè hiệu quả, minh bạch.</p>
      </div>
      <section className={styles.weather} aria-label="Thời tiết hiện tại">
        {!now ? (
          <p>Chưa có dữ liệu thời tiết.</p>
        ) : (
          <>
            <p className={styles.place}><MapPin size={16} aria-hidden="true" />{now.area}</p>
            <p className={styles.temp}>
              <WeatherIcon code={now.code} isDay={now.isDay} size={40} />
              <strong>{Math.round(now.temperature)}°C</strong>
              <span>{weatherCodeToCondition(now.code)}</span>
            </p>
            <p className={styles.readings}>
              <span><Droplet size={15} aria-hidden="true" />Độ ẩm <strong>{now.humidity}%</strong></span>
              <span><Wind size={15} aria-hidden="true" />Gió <strong>{Math.round(now.windSpeed)} km/h</strong></span>
            </p>
          </>
        )}
      </section>
    </header>
  )
}
