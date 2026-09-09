// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect, useState } from 'react'
import { 
  CloudRain, 
  Thermometer, 
  Wind, 
  Droplets, 
  Loader2, 
  Sun, 
  CloudSun, 
  Cloud, 
  CloudLightning, 
  Snowflake, 
  AlertCircle 
} from 'lucide-react'
import styles from './bulletin.module.css'

interface ForecastDay {
  date: string
  temp_max: number
  temp_min: number
  precipitation_mm: number
  condition: string
  icon: string
}

interface WeatherZone {
  parcel_code: string
  parcel_name: string
  crop_type: string
  lat: number
  lng: number
  current: {
    temperature: number
    windspeed: number
    condition: string
    icon: string
  }
  forecast_7d: ForecastDay[]
}

function RenderWeatherIcon({ iconKey, size = 20, className = '' }: { iconKey: string; size?: number; className?: string }) {
  const key = iconKey.toLowerCase()
  if (key.includes('sun') && !key.includes('cloud')) {
    return <Sun size={size} className={`text-amber-500 ${className}`} aria-hidden="true" />
  }
  if (key.includes('cloud-sun')) {
    return <CloudSun size={size} className={`text-amber-400 ${className}`} aria-hidden="true" />
  }
  if (key.includes('rain')) {
    return <CloudRain size={size} className={`text-blue-500 ${className}`} aria-hidden="true" />
  }
  if (key.includes('lightning')) {
    return <CloudLightning size={size} className={`text-purple-500 ${className}`} aria-hidden="true" />
  }
  if (key.includes('snow')) {
    return <Snowflake size={size} className={`text-cyan-400 ${className}`} aria-hidden="true" />
  }
  return <Cloud size={size} className={`text-slate-400 ${className}`} aria-hidden="true" />
}

function RainfallChart({ data }: { data: ForecastDay[] }) {
  const maxPrecip = Math.max(...data.map(d => d.precipitation_mm), 1)
  const chartHeight = 120
  const barWidth = 32
  const gap = 8
  const totalWidth = data.length * (barWidth + gap) - gap

  return (
    <div className={styles.chartContainer}>
      <svg
        width="100%"
        height={chartHeight + 40}
        viewBox={`0 0 ${totalWidth} ${chartHeight + 40}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(pct => (
          <line
            key={pct}
            x1={0}
            y1={chartHeight * (1 - pct)}
            x2={totalWidth}
            y2={chartHeight * (1 - pct)}
            stroke="var(--border)"
            strokeWidth={pct === 0 ? 1.5 : 0.5}
            strokeDasharray={pct === 0 ? 'none' : '4,4'}
          />
        ))}

        {/* Bars */}
        {data.map((d, i) => {
          const barHeight = Math.max((d.precipitation_mm / maxPrecip) * (chartHeight - 10), 2)
          const x = i * (barWidth + gap)
          const y = chartHeight - barHeight
          const dayLabel = new Date(d.date).toLocaleDateString('vi-VN', { weekday: 'short' })
          const isToday = i === 0

          return (
            <g key={d.date}>
              {/* Bar gradient */}
              <defs>
                <linearGradient id={`rain-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={isToday ? 'var(--primary)' : 'var(--color-info)'} />
                  <stop offset="100%" stopColor={isToday ? '#1a8a5e' : '#60a5fa'} />
                </linearGradient>
              </defs>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={4}
                fill={`url(#rain-grad-${i})`}
                opacity={isToday ? 1 : 0.7}
              />
              {/* Precipitation value */}
              {d.precipitation_mm > 0 && (
                <text
                  x={x + barWidth / 2}
                  y={y - 4}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--muted-foreground)"
                  fontWeight={isToday ? '600' : '400'}
                >
                  {d.precipitation_mm.toFixed(1)}
                </text>
              )}
              {/* Day label */}
              <text
                x={x + barWidth / 2}
                y={chartHeight + 16}
                textAnchor="middle"
                fontSize="11"
                fill={isToday ? 'var(--primary)' : 'var(--muted-foreground)'}
                fontWeight={isToday ? '600' : '400'}
              >
                {isToday ? 'H.nay' : dayLabel}
              </text>
              {/* Temperature max label */}
              <text
                x={x + barWidth / 2}
                y={chartHeight + 32}
                textAnchor="middle"
                fontSize="10"
                fill="var(--muted-foreground)"
              >
                {Math.round(d.temp_max)}°C
              </text>
            </g>
          )
        })}

        {/* Y-axis label */}
        <text x={0} y={-4} fontSize="10" fill="var(--muted-foreground)">
          mm
        </text>
      </svg>
    </div>
  )
}

export function WeatherSection() {
  const [zones, setZones] = useState<WeatherZone[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchWeather() {
      try {
        const res = await fetch('/api/weather/forecast?days=7')
        if (!res.ok) throw new Error('Failed to fetch weather')
        const json = await res.json()
        setZones(json.data || [])
      } catch {
        setError('Không thể tải dữ liệu thời tiết')
      } finally {
        setLoading(false)
      }
    }
    fetchWeather()
  }, [])

  if (loading) {
    return (
      <div className={styles.weatherLoading}>
        <Loader2 size={24} className={styles.spinner} aria-hidden="true" />
        <span>Đang tải dữ liệu thời tiết từ Open-Meteo...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.weatherSection}>
        <div className="p-6 text-center bg-amber-50 rounded-lg border border-amber-200">
          <AlertCircle size={32} className="text-amber-600 mx-auto mb-2" aria-hidden="true" />
          <p className="font-semibold text-gray-800">Không thể tải dữ liệu thời tiết</p>
          <p className="text-sm text-gray-600 mt-1">Hệ thống đang kết nối với máy chủ dự báo Open-Meteo. Vui lòng thử lại sau.</p>
        </div>
      </div>
    )
  }

  if (zones.length === 0) {
    return (
      <div className={styles.weatherSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>
            <CloudRain size={20} aria-hidden="true" />
            Thời tiết vùng trồng
          </h2>
          <span className={styles.weatherSource}>Nguồn: Open-Meteo (cập nhật mỗi giờ)</span>
        </div>
        <div className="p-8 text-center bg-white rounded-lg border border-dashed border-gray-300">
          <CloudSun size={40} className="text-gray-400 mx-auto mb-3" aria-hidden="true" />
          <p className="font-medium text-gray-700">Chưa có dữ liệu thời tiết cho các thửa đất hiện tại</p>
          <p className="text-sm text-gray-500 mt-1">Dữ liệu dự báo 7 ngày sẽ tự động được cập nhật khi hệ thống đồng bộ từ Open-Meteo.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.weatherSection}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>
          <CloudRain size={20} aria-hidden="true" />
          Thời tiết vùng trồng
        </h2>
        <span className={styles.weatherSource}>Nguồn: Open-Meteo (cập nhật mỗi giờ)</span>
      </div>

      <div className={styles.weatherGrid}>
        {zones.map(zone => (
          <div key={zone.parcel_code} className={styles.weatherCard}>
            {/* Current Weather Header */}
            <div className={styles.weatherCardHeader}>
              <div className={styles.weatherCardInfo}>
                <span className={styles.weatherZoneName}>{zone.parcel_name}</span>
                <span className={styles.weatherCrop}>{zone.crop_type}</span>
              </div>
              <span className={styles.weatherCurrentIcon}>
                <RenderWeatherIcon iconKey={zone.current.icon} size={28} />
              </span>
            </div>

            {/* Current Stats */}
            <div className={styles.weatherStats}>
              <div className={styles.weatherStat}>
                <Thermometer size={16} aria-hidden="true" />
                <span className={styles.weatherStatValue}>{zone.current.temperature}°C</span>
                <span className={styles.weatherStatLabel}>Nhiệt độ</span>
              </div>
              <div className={styles.weatherStat}>
                <Wind size={16} aria-hidden="true" />
                <span className={styles.weatherStatValue}>{zone.current.windspeed} km/h</span>
                <span className={styles.weatherStatLabel}>Gió</span>
              </div>
              <div className={styles.weatherStat}>
                <Droplets size={16} aria-hidden="true" />
                <span className={styles.weatherStatValue}>
                  {zone.forecast_7d[0]?.precipitation_mm.toFixed(1) ?? '0'} mm
                </span>
                <span className={styles.weatherStatLabel}>Lượng mưa</span>
              </div>
            </div>

            <div className={styles.weatherCondition}>{zone.current.condition}</div>

            {/* Rainfall Chart */}
            <div className={styles.weatherChartSection}>
              <h3 className={styles.weatherChartTitle}>Lượng mưa 7 ngày (mm)</h3>
              <RainfallChart data={zone.forecast_7d} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
