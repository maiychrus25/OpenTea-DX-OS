// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSun, Droplets, Eye, Gauge, Loader2, Moon, Snowflake, Sun, Sunrise, Thermometer, Umbrella, Wind } from 'lucide-react'
import { weatherCodeToCondition } from '@/infrastructure/external/open-meteo-adapter'
import type { WeatherDetail } from '@/infrastructure/external/open-meteo-detail'
import { RainCanvas } from './RainCanvas'
import styles from './weather.module.css'

interface Place {
  parcels: string[]
  weather: WeatherDetail
}

export function WeatherIcon({ code, isDay = true, size = 22 }: { code: number; isDay?: boolean; size?: number }) {
  const Icon =
    code === 0 ? (isDay ? Sun : Moon)
    : code <= 2 ? (isDay ? CloudSun : CloudMoon)
    : code === 3 ? Cloud
    : code <= 48 ? CloudFog
    : code <= 57 ? CloudDrizzle
    : code <= 67 ? CloudRain
    : code <= 77 ? Snowflake
    : code <= 82 ? CloudRain
    : code <= 86 ? Snowflake
    : CloudLightning
  return <Icon size={size} aria-hidden="true" />
}

const degrees = (value: number) => `${Math.round(value)}°`
const clock = (iso: string) => iso.slice(11, 16)
const COMPASS = ['Bắc', 'Đông Bắc', 'Đông', 'Đông Nam', 'Nam', 'Tây Nam', 'Tây', 'Tây Bắc']
const compass = (angle: number) => COMPASS[Math.round(angle / 45) % 8]
const uvLabel = (uv: number) => (uv < 3 ? 'Thấp' : uv < 6 ? 'Trung bình' : uv < 8 ? 'Cao' : uv < 11 ? 'Rất cao' : 'Nguy hại')

function dayName(date: string, index: number) {
  if (index === 0) return 'Hôm nay'
  const day = new Date(`${date}T00:00:00`).getDay()
  return day === 0 ? 'CN' : `Thứ ${day + 1}`
}

function Tile({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) {
  return (
    <div className={styles.tile}>
      <p className={styles.cardTitle}>{icon}{label}</p>
      <p className={styles.tileValue}>{value}</p>
      <p className={styles.tileNote}>{note}</p>
    </div>
  )
}

export function WeatherSection({ collapsed = false }: { collapsed?: boolean } = {}) {
  const [places, setPlaces] = useState<Place[]>([])
  const [open, setOpen] = useState<number | null>(collapsed ? null : 0) // the first area starts expanded unless asked not to
  const [area, setArea] = useState('')
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  const load = useCallback(async () => {
    setState('loading')
    try {
      const res = await fetch('/api/weather/live', { cache: 'no-store' })
      if (!res.ok) throw new Error('weather')
      const json = await res.json()
      setPlaces(json.data ?? [])
      setArea(json.area ?? '')
      setState('ready')
    } catch {
      setState('error')
    }
  }, [])

  useEffect(() => { load() }, [load])

  const heading = <h2 className={styles.heading}>Thời tiết vùng trồng</h2>

  if (state !== 'ready' || places.length === 0) {
    return (
      <section className={styles.section} aria-label="Thời tiết vùng trồng">
        {heading}
        <div className={styles.message} role="status">
          {state === 'loading' && <><Loader2 size={22} className={styles.spinner} aria-hidden="true" />Đang tải thời tiết...</>}
          {state === 'error' && (
            <>Không lấy được dữ liệu thời tiết.<button type="button" className={styles.retry} onClick={load}>Thử lại</button></>
          )}
          {state === 'ready' && 'Chưa có thửa nào được định vị. Vẽ thửa trên bản đồ vùng trồng để xem thời tiết.'}
        </div>
      </section>
    )
  }

  return (
    <section className={styles.section} aria-label="Thời tiết vùng trồng">
      {heading}
      {places.map((p, i) => (
        <WeatherCard
          key={p.parcels[0]}
          place={p}
          area={area}
          open={open === i}
          onToggle={() => setOpen(open === i ? null : i)}
        />
      ))}
    </section>
  )
}

export const isRainy = (code: number) => (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95

function WeatherCard({ place, area, open, onToggle }: { place: Place; area: string; open: boolean; onToggle: () => void }) {
  const [showMore, setShowMore] = useState(false)
  const { current, hourly, daily, updatedAt } = place.weather
  const today = daily[0]

  return (
    <>
      <div className={styles.scene}>
        {isRainy(current.code) && <RainCanvas code={current.code} windSpeed={current.windSpeed} />}
        <button type="button" className={styles.summary} aria-expanded={open} onClick={onToggle}>
          <span className={styles.bigIcon}><WeatherIcon code={current.code} isDay={current.isDay} size={open ? 50 : 34} /></span>
          <span className={styles.where}>
            <span className={styles.location}>{place.parcels.length} thửa quanh {place.parcels[0]}</span>
            {area && <span className={styles.muted}>{area}</span>}
          </span>
          <span className={styles.temperature}>{Math.round(current.temperature)}°C</span>
          <span className={styles.sky}>
            <span className={styles.condition}>{weatherCodeToCondition(current.code)}</span>
            {today && <span className={styles.muted}>Cao {degrees(today.max)} · Thấp {degrees(today.min)}</span>}
          </span>
          <span className={styles.toggle}>
            <span className={styles.toggleText}>{open ? 'Thu gọn' : 'Xem chi tiết'}</span>
            {open ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
          </span>
        </button>

        {open && (
          <>
            <dl className={`${styles.glass} ${styles.stats}`}>
              <div><Umbrella size={28} aria-hidden="true" /><span><dt>Khả năng mưa</dt><dd>{today?.rainChance ?? 0}%</dd></span></div>
              <div><Droplets size={28} aria-hidden="true" /><span><dt>Độ ẩm</dt><dd>{current.humidity}%</dd></span></div>
              <div><Wind size={28} aria-hidden="true" /><span><dt>Gió</dt><dd>{Math.round(current.windSpeed)} km/h</dd></span></div>
            </dl>

            <div className={styles.glass}>
              <div className={styles.hoursHead}>
                <h3>Dự báo theo giờ</h3>
                <span>Open-Meteo · cập nhật {clock(updatedAt)}</span>
              </div>
              <ol className={styles.hours}>
                {hourly.map((hour) => (
                  <li key={hour.time} className={styles.hour}>
                    <span>{clock(hour.time)}</span>
                    <WeatherIcon code={hour.code} isDay={hour.isDay} size={30} />
                    <strong>{degrees(hour.temperature)}</strong>
                  </li>
                ))}
              </ol>
            </div>

            <button type="button" className={styles.more} aria-expanded={showMore} onClick={() => setShowMore(!showMore)}>
              {showMore ? 'Ẩn dự báo 10 ngày' : 'Xem dự báo 10 ngày và chỉ số khác'}
              {showMore ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
            </button>
          </>
        )}
      </div>

      {open && showMore && <WeatherDetails weather={place.weather} />}
    </>
  )
}

function WeatherDetails({ weather }: { weather: WeatherDetail }) {
  const { current, today, daily } = weather
  const lowest = Math.min(...daily.map((d) => d.min))
  const span = Math.max(...daily.map((d) => d.max)) - lowest || 1
  const percent = (value: number) => `${((value - lowest) / span) * 100}%`

  return (
      <div className={styles.panel}>
        <div className={styles.details}>
          <div className={styles.block}>
            <p className={styles.cardTitle}>Dự báo {daily.length} ngày</p>
            <ol className={styles.days}>
              {daily.map((day, i) => (
                <li key={day.date} className={styles.day}>
                  <span>{dayName(day.date, i)}</span>
                  <span className={styles.dayIcon}>
                    <WeatherIcon code={day.code} size={20} />
                    {day.rainChance >= 20 && <span className={styles.chance}>{day.rainChance}%</span>}
                  </span>
                  <span className={styles.low}>{degrees(day.min)}</span>
                  <svg className={styles.bar} viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true">
                    <line x1="0" y1="2" x2="100" y2="2" className={styles.barTrack} />
                    <line x1={percent(day.min)} y1="2" x2={percent(day.max)} y2="2" className={styles.barFill} />
                  </svg>
                  <span>{degrees(day.max)}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className={styles.tiles}>
            <Tile icon={<Thermometer size={14} aria-hidden="true" />} label="Cảm nhận" value={degrees(current.feelsLike)} note={`Nhiệt độ thực ${degrees(current.temperature)}`} />
            <Tile icon={<Droplets size={14} aria-hidden="true" />} label="Độ ẩm" value={`${current.humidity}%`} note={current.humidity >= 85 ? 'Ẩm cao, chú ý nấm bệnh' : 'Trong không khí'} />
            <Tile icon={<Umbrella size={14} aria-hidden="true" />} label="Lượng mưa" value={`${(daily[0]?.rainMm ?? 0).toLocaleString('vi-VN')} mm`} note={`Dự kiến hôm nay · khả năng ${daily[0]?.rainChance ?? 0}%`} />
            <Tile icon={<Wind size={14} aria-hidden="true" />} label="Gió" value={`${Math.round(current.windSpeed)} km/h`} note={`Hướng ${compass(current.windDirection)} · giật ${Math.round(current.windGust)} km/h`} />
            {today.uvMax != null && <Tile icon={<Sun size={14} aria-hidden="true" />} label="Chỉ số UV" value={String(Math.round(today.uvMax))} note={`${uvLabel(today.uvMax)} (cao nhất hôm nay)`} />}
            <Tile icon={<Sunrise size={14} aria-hidden="true" />} label="Mặt trời mọc" value={clock(today.sunrise)} note={`Lặn lúc ${clock(today.sunset)}`} />
            <Tile icon={<Gauge size={14} aria-hidden="true" />} label="Áp suất" value={`${Math.round(current.pressure)}`} note="hPa" />
            {current.visibilityKm != null && <Tile icon={<Eye size={14} aria-hidden="true" />} label="Tầm nhìn" value={`${Math.round(current.visibilityKm)} km`} note={current.visibilityKm >= 10 ? 'Quang đãng' : 'Hạn chế'} />}
          </div>
        </div>

      </div>
  )
}
