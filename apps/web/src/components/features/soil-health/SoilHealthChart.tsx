// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { X, Droplets, Thermometer, MapPin, Sprout, AlertTriangle } from 'lucide-react'
import styles from './soil-health.module.css'

interface SoilHealthDataPoint {
  date: string
  soil_moisture: number | null
  soil_temperature: number | null
}

interface ParcelMeta {
  id: string
  parcel_code: string
  crop_type: string | null
  status: string
  area_ha: number | null
  centroid_lat: number
  centroid_lng: number
}

interface SoilHealthResponse {
  data: {
    parcel: ParcelMeta
    soil_health: SoilHealthDataPoint[]
    metadata: {
      source: string
      license: string
      period_days: number
      data_depth: string
      timezone: string
    }
  }
}

interface SoilHealthChartProps {
  parcelId: string
  parcelName: string
  onClose: () => void
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null

  const dateStr = label
    ? new Date(label).toLocaleDateString('vi-VN', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : ''

  return (
    <div className={styles.customTooltip}>
      <p className={styles.tooltipDate}>{dateStr}</p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className={styles.tooltipRow}>
          <span
            className={styles.tooltipDot}
            style={{ backgroundColor: entry.color }}
          />
          <span>
            {entry.dataKey === 'soil_moisture' ? 'Độ ẩm' : 'Nhiệt độ'}:
          </span>
          <span className={styles.tooltipValue}>
            {entry.value != null
              ? entry.dataKey === 'soil_moisture'
                ? `${(entry.value * 100).toFixed(1)}%`
                : `${entry.value}°C`
              : '—'}
          </span>
        </div>
      ))}
    </div>
  )
}

export function SoilHealthChart({ parcelId, parcelName, onClose }: SoilHealthChartProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<SoilHealthDataPoint[]>([])
  const [meta, setMeta] = useState<SoilHealthResponse['data'] | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const res = await fetch(`/api/farm/parcels/${parcelId}/soil-health`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Không thể tải dữ liệu')
      }

      const json: SoilHealthResponse = await res.json()
      setData(json.data.soil_health)
      setMeta(json.data)
    } catch (err: any) {
      setError(err.message || 'Đã có lỗi xảy ra')
    } finally {
      setLoading(false)
    }
  }, [parcelId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const formatXAxisDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.getDate()}/${d.getMonth() + 1}`
  }

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-label="Sức khỏe đất">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.headerIcon}>
              <Sprout size={20} aria-hidden="true" />
            </div>
            <div>
              <h2 className={styles.headerTitle}>Sức khỏe đất</h2>
              <p className={styles.headerSubtitle}>{parcelName} - 30 ngày gần nhất</p>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Đóng">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        {loading ? (
          <div className={styles.loadingContainer}>
            <div className={styles.loadingSpinner} />
            <p className={styles.loadingText}>Đang tải dữ liệu đất từ Open-Meteo...</p>
          </div>
        ) : error ? (
          <div className={styles.errorContainer}>
            <AlertTriangle size={40} className="text-warning" aria-hidden="true" />
            <h3 className={styles.errorTitle}>Không thể tải dữ liệu</h3>
            <p className={styles.errorMessage}>{error}</p>
          </div>
        ) : (
          <>
            <div className={styles.body}>
              {/* Meta chips */}
              <div className={styles.metaBar}>
                <div className={styles.metaChip}>
                  <MapPin size={14} aria-hidden="true" />
                  <span>Tọa độ:</span>
                  <span className={styles.metaChipValue}>
                    {meta?.parcel.centroid_lat?.toFixed(4)}, {meta?.parcel.centroid_lng?.toFixed(4)}
                  </span>
                </div>
                <div className={styles.metaChip}>
                  <Sprout size={14} aria-hidden="true" />
                  <span>Cây trồng:</span>
                  <span className={styles.metaChipValue}>
                    {meta?.parcel.crop_type || 'Chưa gán'}
                  </span>
                </div>
                <div className={styles.metaChip}>
                  <Droplets size={14} aria-hidden="true" />
                  <span>Tầng đất:</span>
                  <span className={styles.metaChipValue}>
                    {meta?.metadata.data_depth || '0-7cm'}
                  </span>
                </div>
              </div>

              {/* Soil Moisture Chart */}
              <div className={styles.chartSection}>
                <h3 className={styles.chartTitle}>
                  <span className={styles.chartTitleDot} style={{ backgroundColor: 'var(--color-info)' }} />
                  <Droplets size={16} aria-hidden="true" /> Độ ẩm đất (%)
                </h3>
                <div className={styles.chartContainer}>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <defs>
                        <linearGradient id="moistureGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--color-info)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="var(--color-info)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatXAxisDate}
                        fontSize={11}
                        tick={{ fill: 'var(--color-ink-tertiary)' }}
                      />
                      <YAxis
                        fontSize={11}
                        tick={{ fill: 'var(--color-ink-tertiary)' }}
                        tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                        domain={['auto', 'auto']}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="soil_moisture"
                        stroke="var(--color-info)"
                        strokeWidth={2}
                        fill="url(#moistureGradient)"
                        dot={false}
                        activeDot={{ r: 5, strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Soil Temperature Chart */}
              <div className={styles.chartSection}>
                <h3 className={styles.chartTitle}>
                  <span className={styles.chartTitleDot} style={{ backgroundColor: 'var(--color-danger)' }} />
                  <Thermometer size={16} aria-hidden="true" /> Nhiệt độ đất (°C)
                </h3>
                <div className={styles.chartContainer}>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <defs>
                        <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--color-danger)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="var(--color-danger)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatXAxisDate}
                        fontSize={11}
                        tick={{ fill: 'var(--color-ink-tertiary)' }}
                      />
                      <YAxis
                        fontSize={11}
                        tick={{ fill: 'var(--color-ink-tertiary)' }}
                        tickFormatter={(v: number) => `${v}°C`}
                        domain={['auto', 'auto']}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="soil_temperature"
                        stroke="var(--color-danger)"
                        strokeWidth={2}
                        fill="url(#tempGradient)"
                        dot={false}
                        activeDot={{ r: 5, strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Source Bar */}
            <div className={styles.sourceBar}>
              <span className={styles.sourceText}>
                Nguồn dữ liệu:{' '}
                <a
                  href="https://open-meteo.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.sourceLink}
                >
                  Open-Meteo
                </a>{' '}
                (CC BY 4.0) - Dữ liệu thực tế, cập nhật hàng giờ
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
