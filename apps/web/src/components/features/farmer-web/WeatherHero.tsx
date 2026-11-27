// SPDX-License-Identifier: MIT
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CloudRain, Droplet, Leaf, MapPin } from 'lucide-react'
import { weatherCodeToCondition } from '@/infrastructure/external/open-meteo-adapter'
import { RainCanvas } from '@/components/features/bulletin/RainCanvas'
import { WeatherIcon, isRainy } from '@/components/features/bulletin/WeatherSection'
import type { HeroAction } from '@/components/ui/HeroBanner/HeroBanner'
import styles from './weather-hero.module.css'

export interface HeroWeather {
  temperature: number
  condition: string
  humidity: number
  rainMm: number
  /** WMO code, wind and daylight are only known for live readings. */
  code?: number
  windSpeed?: number
  isDay?: boolean
}

interface Props {
  eyebrow: string
  title: string
  subtitle: string
  actions: HeroAction[]
  place: string
  /** Last stored reading, shown until the live one arrives or when it cannot be read. */
  cached: HeroWeather | null
  forecastHref?: string
}

/** The greeting banner with the weather over the parcels; it rains on the banner when it rains there. */
export function WeatherHero({ eyebrow, title, subtitle, actions, place, cached, forecastHref = '/farmer/bulletin-notifications' }: Props) {
  const [live, setLive] = useState<{ weather: HeroWeather; area: string } | null>(null)

  useEffect(() => {
    let gone = false
    const load = async () => {
      try {
        const res = await fetch('/api/weather/live', { cache: 'no-store' })
        if (!res.ok) return
        const json = await res.json()
        const detail = json.data?.[0]?.weather
        if (gone || !detail) return
        const { current, daily } = detail
        setLive({
          area: json.area ?? '',
          weather: {
            temperature: current.temperature,
            condition: weatherCodeToCondition(current.code),
            humidity: current.humidity,
            rainMm: daily[0]?.rainMm ?? current.rainMm,
            code: current.code,
            windSpeed: current.windSpeed,
            isDay: current.isDay,
          },
        })
      } catch {
        // The stored reading stays on screen.
      }
    }
    void load()
    return () => {
      gone = true
    }
  }, [])

  const weather = live?.weather ?? cached
  const raining = weather?.code !== undefined && isRainy(weather.code)

  return (
    <header className={styles.hero}>
      {raining && (
        <div className={styles.rain} data-testid="hero-rain">
          <RainCanvas code={weather.code!} windSpeed={weather.windSpeed ?? 0} />
        </div>
      )}
      <div className={styles.content}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.subtitle}>{subtitle}</p>
        <div className={styles.actions}>
          {actions.map((action, index) => (
            <Link key={action.label} href={action.href} className={index === 0 ? styles.primary : styles.secondary}>
              {action.icon}
              {action.label}
            </Link>
          ))}
        </div>
      </div>

      <section className={styles.card} data-testid="weather-widget" aria-label="Thời tiết hiện tại">
        {(live?.area || place) && <p className={styles.place}><MapPin size={15} aria-hidden="true" />{live?.area || place}</p>}
        {!weather ? (
          <p>Chưa có dữ liệu thời tiết cho khu vực của bạn.</p>
        ) : (
          <>
            <div className={styles.now}>
              <WeatherIcon code={weather.code ?? 3} isDay={weather.isDay} size={56} />
              <span>
                <strong>{Math.round(weather.temperature)}°C</strong>
                <span>{weather.condition}</span>
              </span>
            </div>
            <dl className={styles.readings}>
              <div><dt>Độ ẩm</dt><dd><Droplet size={16} aria-hidden="true" />{weather.humidity}%</dd></div>
              <div><dt>Lượng mưa</dt><dd><CloudRain size={16} aria-hidden="true" />{weather.rainMm.toLocaleString('vi-VN')} mm</dd></div>
            </dl>
          </>
        )}
        <div className={weather && weather.rainMm > 0 ? styles.advice : styles.footer}>
          {weather && weather.rainMm > 0 && (
            <>
              <Leaf size={18} aria-hidden="true" />
              <span>Không nên phun thuốc hôm nay: thuốc dễ bị rửa trôi do mưa.</span>
            </>
          )}
          <Link href={forecastHref} className={styles.forecast}>
            Xem dự báo <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </header>
  )
}
