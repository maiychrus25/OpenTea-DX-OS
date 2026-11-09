// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  ArrowLeft,
  Droplets,
  Thermometer,
  MapPin,
  Sprout,
  AlertTriangle,
  Layers,
  Maximize2,
  Bug,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Activity,
} from 'lucide-react'
import styles from './soil-health-page.module.css'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'

// ─── Types ───────────────────────────────────────
interface Parcel {
  id: string
  parcel_code: string
  crop_type: string | null
  status: string
  area_ha: number | null
  centroid_lat: number | null
  centroid_lng: number | null
  household?: { name?: string } | null
}

interface SoilHealthDataPoint {
  date: string
  soil_moisture: number | null
  soil_temperature: number | null
}

interface DiseaseRecord {
  id: string
  detection_date: string
  ai_disease_name: string
  ai_confidence: number
  confirmed_diagnosis: string | null
  status: string
  treatment_notes: string | null
}

interface PestRisk {
  average_score: number
  level: 'LOW' | 'MEDIUM' | 'HIGH'
  high_risk_days: number
  total_analyzed_days: number
  risk_factors: string[]
  total_disease_reports: number
}

interface SoilHealthApiResponse {
  data: {
    parcel: {
      id: string
      parcel_code: string
      crop_type: string | null
      status: string
      area_ha: number | null
      centroid_lat: number
      centroid_lng: number
    }
    soil_health: SoilHealthDataPoint[]
    disease_history: DiseaseRecord[]
    pest_risk: PestRisk | null
    metadata: {
      source: string
      license: string
      period_days: number
      data_depth: string
      timezone: string
    }
  }
}

// ─── Custom Tooltip ──────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
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
    <div className={styles.tooltip}>
      <p className={styles.tooltipDate}>{dateStr}</p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className={styles.tooltipRow}>
          <span className={styles.tooltipDot} style={{ backgroundColor: entry.color }} />
          <span>{entry.dataKey === 'soil_moisture' ? 'Độ ẩm' : 'Nhiệt độ'}:</span>
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

// ─── Main Client Component ───────────────────────
interface SoilHealthPageClientProps {
  householdId: string
  householdName: string
}

export default function SoilHealthPageClient({
  householdId,
  householdName,
}: SoilHealthPageClientProps) {
  const router = useRouter()

  // ─ State ─
  const [parcels, setParcels] = useState<Parcel[]>([])
  const [parcelsLoading, setParcelsLoading] = useState(true)
  const [parcelsLoadFailed, setParcelsLoadFailed] = useState(false)
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null)
  const [soilData, setSoilData] = useState<SoilHealthDataPoint[]>([])
  const [soilLoading, setSoilLoading] = useState(false)
  const [soilError, setSoilError] = useState<string | null>(null)
  const [parcelMeta, setParcelMeta] = useState<SoilHealthApiResponse['data'] | null>(null)

  // ─ Load parcels ─
  useEffect(() => {
    async function loadParcels() {
      try {
        const json = await fetchJson<{ data?: Parcel[] }>(`/api/farm/parcels?household_id=${householdId}`)
        const list: Parcel[] = json.data || []
        setParcels(list)
        // Auto-select first parcel that has coordinates
        const withCoords = list.find(
          (p) => p.centroid_lat != null && p.centroid_lng != null
        )
        if (withCoords) {
          setSelectedParcelId(withCoords.id)
        }
      } catch {
        setParcels([])
        setParcelsLoadFailed(true)
      } finally {
        setParcelsLoading(false)
      }
    }
    loadParcels()
  }, [householdId])

  // ─ Load soil data for selected parcel ─
  const fetchSoilHealth = useCallback(async (parcelId: string) => {
    try {
      setSoilLoading(true)
      setSoilError(null)
      setSoilData([])
      setParcelMeta(null)

      const res = await fetch(`/api/farm/parcels/${parcelId}/soil-health`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Không thể tải dữ liệu')
      }

      const json: SoilHealthApiResponse = await res.json()
      setSoilData(json.data.soil_health)
      setParcelMeta(json.data)
    } catch (err: any) {
      setSoilError(err.message || 'Đã có lỗi xảy ra')
    } finally {
      setSoilLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedParcelId) {
      fetchSoilHealth(selectedParcelId)
    }
  }, [selectedParcelId, fetchSoilHealth])

  // ─ Computed stats ─
  const stats = useMemo(() => {
    if (soilData.length === 0) return null
    const moistures = soilData.filter((d) => d.soil_moisture != null).map((d) => d.soil_moisture!)
    const temps = soilData.filter((d) => d.soil_temperature != null).map((d) => d.soil_temperature!)

    return {
      avgMoisture: moistures.length > 0
        ? (moistures.reduce((a, b) => a + b, 0) / moistures.length * 100).toFixed(1)
        : null,
      avgTemp: temps.length > 0
        ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1)
        : null,
    }
  }, [soilData])

  const selectedParcel = parcels.find((p) => p.id === selectedParcelId)

  const formatXAxisDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.getDate()}/${d.getMonth() + 1}`
  }

  return (
    <div className={styles.pageContainer}>
      {/* ─── Header ─── */}
      <header className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <button
            className={styles.backBtn}
            onClick={() => router.push(`/officer/households/${householdId}`)}
            aria-label="Quay lại hồ sơ nông hộ"
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          <div className={styles.headerTitles}>
            <h1>Sức khỏe đất</h1>
            <p>
              Lịch sử độ ẩm và nhiệt độ thổ nhưỡng 30 ngày gần nhất
            </p>
          </div>
        </div>
        <div className={styles.householdBadge}>
          <Sprout size={14} aria-hidden="true" />
          {householdName}
        </div>
      </header>

      {/* ─── Content ─── */}
      <div className={styles.contentGrid}>
        {/* ─── Sidebar: Parcel list ─── */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <h2 className={styles.sidebarTitle}>Thửa đất</h2>
            <span className={styles.parcelCount}>{parcels.length} thửa</span>
          </div>

          {parcelsLoading ? (
            <div className={styles.loadingState}>
              <div className={styles.spinner} />
              <p className={styles.loadingText}>Đang tải...</p>
            </div>
          ) : parcelsLoadFailed ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyText}>{LOAD_FAILED_MESSAGE}</p>
            </div>
          ) : parcels.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <Layers size={28} aria-hidden="true" />
              </div>
              <h3 className={styles.emptyTitle}>Chưa có thửa đất</h3>
              <p className={styles.emptyText}>
                Nông hộ này chưa được gán thửa đất nào.
              </p>
            </div>
          ) : (
            <div className={styles.parcelList}>
              {parcels.map((p) => {
                const hasCoords = p.centroid_lat != null && p.centroid_lng != null
                const isActive = p.id === selectedParcelId
                return (
                  <button
                    key={p.id}
                    className={`${styles.parcelCard} ${isActive ? styles.parcelCardActive : ''}`}
                    onClick={() => {
                      if (hasCoords) setSelectedParcelId(p.id)
                    }}
                    disabled={!hasCoords}
                    style={!hasCoords ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                    aria-label={`Xem sức khỏe đất cho ${p.parcel_code}`}
                    aria-pressed={isActive}
                  >
                    <h3 className={styles.parcelName}>{p.parcel_code}</h3>
                    <div className={styles.parcelMeta}>
                      {p.crop_type && (
                        <span className={`${styles.parcelChip} ${styles.parcelChipCrop}`}>
                          <Sprout size={11} aria-hidden="true" />
                          {p.crop_type}
                        </span>
                      )}
                      {p.area_ha != null && (
                        <span className={`${styles.parcelChip} ${styles.parcelChipArea}`}>
                          <Maximize2 size={11} aria-hidden="true" />
                          {p.area_ha} ha
                        </span>
                      )}
                      {!hasCoords && (
                        <span className={`${styles.parcelChip} ${styles.noCoordBadge}`}>
                          <MapPin size={11} aria-hidden="true" />
                          Chưa có tọa độ
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </aside>

        {/* ─── Main: Charts ─── */}
        <main className={styles.mainPanel}>
          {!selectedParcelId ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <Sprout size={28} aria-hidden="true" />
              </div>
              <h3 className={styles.emptyTitle}>Chọn thửa đất</h3>
              <p className={styles.emptyText}>
                Chọn một thửa đất ở bên trái để xem dữ liệu sức khỏe đất.
              </p>
            </div>
          ) : soilLoading ? (
            <div className={styles.loadingState}>
              <div className={styles.spinner} />
              <p className={styles.loadingText}>
                Đang tải dữ liệu từ Open-Meteo cho {selectedParcel?.parcel_code}...
              </p>
            </div>
          ) : soilError ? (
            <div className={styles.errorState}>
              <AlertTriangle size={40} className="text-amber-500" aria-hidden="true" />
              <h3 className={styles.emptyTitle}>Không thể tải dữ liệu</h3>
              <p className={styles.emptyText}>{soilError}</p>
            </div>
          ) : (
            <>
              {/* ── Stats row ── */}
              <div className={styles.statsRow}>
                <div className={styles.statCard}>
                  <div className={`${styles.statIcon} ${styles.statIconMoisture}`}>
                    <Droplets size={22} aria-hidden="true" />
                  </div>
                  <div>
                    <p className={styles.statLabel}>Độ ẩm TB</p>
                    <p className={styles.statValue}>
                      {stats?.avgMoisture != null ? `${stats.avgMoisture}%` : '—'}
                    </p>
                  </div>
                </div>

                <div className={styles.statCard}>
                  <div className={`${styles.statIcon} ${styles.statIconTemp}`}>
                    <Thermometer size={22} aria-hidden="true" />
                  </div>
                  <div>
                    <p className={styles.statLabel}>Nhiệt độ TB</p>
                    <p className={styles.statValue}>
                      {stats?.avgTemp != null ? `${stats.avgTemp}°C` : '—'}
                    </p>
                  </div>
                </div>

                <div className={styles.statCard}>
                  <div className={`${styles.statIcon} ${styles.statIconCoord}`}>
                    <MapPin size={22} aria-hidden="true" />
                  </div>
                  <div>
                    <p className={styles.statLabel}>Tọa độ</p>
                    <p className={`${styles.statValue} ${styles.statValueSmall}`}>
                      {parcelMeta?.parcel.centroid_lat?.toFixed(4)},{' '}
                      {parcelMeta?.parcel.centroid_lng?.toFixed(4)}
                    </p>
                  </div>
                </div>
              </div>

              {/* ── Soil Moisture Chart ── */}
              <div className={styles.chartCard}>
                <div className={styles.chartHeader}>
                  <h3 className={styles.chartTitle}>
                    <span className={styles.chartDot} style={{ backgroundColor: '#3b82f6' }} />
                    <Droplets size={18} aria-hidden="true" />
                    Độ ẩm đất
                  </h3>
                  <span className={styles.chartUnit}>m3/m3 (tầng 0-7cm)</span>
                </div>
                <div className={styles.chartBody}>
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={soilData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <defs>
                        <linearGradient id="moistureGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.01} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatXAxisDate}
                        fontSize={11}
                        tick={{ fill: '#9ca3af' }}
                        axisLine={{ stroke: '#e5e7eb' }}
                      />
                      <YAxis
                        fontSize={11}
                        tick={{ fill: '#9ca3af' }}
                        tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                        domain={['auto', 'auto']}
                        axisLine={{ stroke: '#e5e7eb' }}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="soil_moisture"
                        stroke="#3b82f6"
                        strokeWidth={2.5}
                        fill="url(#moistureGrad)"
                        dot={false}
                        activeDot={{ r: 5, strokeWidth: 2, fill: '#fff', stroke: '#3b82f6' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* ── Soil Temperature Chart ── */}
              <div className={styles.chartCard}>
                <div className={styles.chartHeader}>
                  <h3 className={styles.chartTitle}>
                    <span className={styles.chartDot} style={{ backgroundColor: '#ef4444' }} />
                    <Thermometer size={18} aria-hidden="true" />
                    Nhiệt độ đất
                  </h3>
                  <span className={styles.chartUnit}>°C (bề mặt)</span>
                </div>
                <div className={styles.chartBody}>
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={soilData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <defs>
                        <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0.01} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatXAxisDate}
                        fontSize={11}
                        tick={{ fill: '#9ca3af' }}
                        axisLine={{ stroke: '#e5e7eb' }}
                      />
                      <YAxis
                        fontSize={11}
                        tick={{ fill: '#9ca3af' }}
                        tickFormatter={(v: number) => `${v}°C`}
                        domain={['auto', 'auto']}
                        axisLine={{ stroke: '#e5e7eb' }}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="soil_temperature"
                        stroke="#ef4444"
                        strokeWidth={2.5}
                        fill="url(#tempGrad)"
                        dot={false}
                        activeDot={{ r: 5, strokeWidth: 2, fill: '#fff', stroke: '#ef4444' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* ── Pest Risk Analysis ── */}
              {parcelMeta?.pest_risk && (
                <div className={styles.riskCard}>
                  <div className={styles.riskHeader}>
                    <h3 className={styles.riskTitle}>
                      <ShieldAlert size={18} aria-hidden="true" />
                      Phân tích rủi ro sâu bệnh
                    </h3>
                    <span className={`${styles.riskBadge} ${
                      parcelMeta.pest_risk.level === 'LOW' ? styles.riskBadgeLow :
                      parcelMeta.pest_risk.level === 'MEDIUM' ? styles.riskBadgeMedium :
                      styles.riskBadgeHigh
                    }`}>
                      {parcelMeta.pest_risk.level === 'LOW' ? 'Thấp' :
                       parcelMeta.pest_risk.level === 'MEDIUM' ? 'Trung bình' : 'Cao'}
                    </span>
                  </div>
                  <div className={styles.riskBody}>
                    <div className={styles.riskGrid}>
                      <div className={styles.riskGaugeContainer}>
                        <div
                          className={styles.riskGauge}
                          style={{
                            background: `conic-gradient(
                              ${parcelMeta.pest_risk.level === 'LOW' ? '#22c55e' :
                                parcelMeta.pest_risk.level === 'MEDIUM' ? '#f59e0b' : '#ef4444'}
                              ${parcelMeta.pest_risk.average_score * 3.6}deg,
                              #f3f4f6 ${parcelMeta.pest_risk.average_score * 3.6}deg
                            )`,
                          }}
                        >
                          <div className={styles.riskGaugeInner}>
                            <p className={styles.riskGaugeValue} style={{
                              color: parcelMeta.pest_risk.level === 'LOW' ? '#22c55e' :
                                     parcelMeta.pest_risk.level === 'MEDIUM' ? '#f59e0b' : '#ef4444'
                            }}>
                              {parcelMeta.pest_risk.average_score}
                            </p>
                            <p className={styles.riskGaugeLabel}>/ 100</p>
                          </div>
                        </div>
                        <p className={styles.riskGaugeCaption}>
                          {parcelMeta.pest_risk.high_risk_days} / {parcelMeta.pest_risk.total_analyzed_days} ngày rủi ro cao
                        </p>
                      </div>
                      <ul className={styles.riskFactorsList}>
                        {parcelMeta.pest_risk.risk_factors.map((factor, i) => (
                          <li key={i} className={styles.riskFactor}>
                            <Activity size={16} className={styles.riskFactorIcon} aria-hidden="true" />
                            {factor}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Disease History Timeline ── */}
              <div className={styles.diseaseCard}>
                <div className={styles.diseaseHeader}>
                  <h3 className={styles.diseaseTitle}>
                    <Bug size={18} aria-hidden="true" />
                    Lịch sử dịch bệnh
                  </h3>
                  <span className={styles.diseaseCount}>
                    {parcelMeta?.disease_history?.length || 0} báo cáo
                  </span>
                </div>
                <div className={styles.diseaseBody}>
                  {(!parcelMeta?.disease_history || parcelMeta.disease_history.length === 0) ? (
                    <div className={styles.diseaseEmptyState}>
                      <div className={styles.diseaseEmptyIcon}>
                        <ShieldCheck size={24} aria-hidden="true" />
                      </div>
                      <h4 className={styles.diseaseEmptyTitle}>Chưa ghi nhận dịch bệnh</h4>
                      <p className={styles.diseaseEmptyText}>
                        Thửa đất này chưa có báo cáo sâu bệnh nào. Dữ liệu sẽ tự động cập nhật khi nông dân sử dụng tính năng chẩn đoán AI.
                      </p>
                    </div>
                  ) : (
                    <div className={styles.diseaseTimeline}>
                      {parcelMeta.disease_history.map((d) => {
                        const dotClass = d.status === 'CONFIRMED' ? styles.diseaseDotConfirmed :
                          d.status === 'REJECTED' ? styles.diseaseDotRejected : styles.diseaseDotPending
                        const statusLabel = d.status === 'CONFIRMED' ? 'Xác nhận' :
                          d.status === 'REJECTED' ? 'Loại bỏ' : 'Chờ duyệt'
                        return (
                          <div key={d.id} className={styles.diseaseItem}>
                            <div className={`${styles.diseaseDot} ${dotClass}`}>
                              <Bug size={14} aria-hidden="true" />
                            </div>
                            <div className={styles.diseaseContent}>
                              <h4 className={styles.diseaseName}>
                                {d.confirmed_diagnosis || d.ai_disease_name}
                              </h4>
                              <p className={styles.diseaseDate}>
                                <Clock size={11} aria-hidden="true" />{' '}
                                {new Date(d.detection_date).toLocaleDateString('vi-VN', {
                                  day: '2-digit', month: '2-digit', year: 'numeric',
                                  hour: '2-digit', minute: '2-digit'
                                })}
                              </p>
                              <div className={styles.diseaseDetails}>
                                <span className={`${styles.diseaseTag} ${styles.diseaseTagConfidence}`}>
                                  AI: {(d.ai_confidence * 100).toFixed(0)}%
                                </span>
                                <span className={`${styles.diseaseTag} ${styles.diseaseTagStatus}`}>
                                  {statusLabel}
                                </span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Source bar ── */}
              <div className={styles.sourceBar}>
                <Sprout size={14} aria-hidden="true" />
                <span>
                  Dữ liệu thực tế từ{' '}
                  <a
                    href="https://open-meteo.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.sourceLink}
                  >
                    Open-Meteo
                  </a>{' '}
                  (CC BY 4.0) | Dịch bệnh: dữ liệu nội bộ hệ thống
                </span>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
