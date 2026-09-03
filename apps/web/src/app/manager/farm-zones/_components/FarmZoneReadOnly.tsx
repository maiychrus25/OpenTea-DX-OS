// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

"use client"

import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import 'leaflet/dist/leaflet.css'
import { MapPin, Target } from 'lucide-react'

// Dynamic imports for react-leaflet to ensure ssr:false behavior per requirement
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false })
const GeoJSON = dynamic(() => import('react-leaflet').then(m => m.GeoJSON), { ssr: false })
const LayersControl = dynamic(() => import('react-leaflet').then(m => m.LayersControl), { ssr: false })
const BaseLayer = dynamic(() => import('react-leaflet').then(m => m.LayersControl.BaseLayer), { ssr: false })
const Tooltip = dynamic<any>(() => import('react-leaflet').then(m => (m as any).Tooltip), { ssr: false })

const MapUpdater = dynamic(() => import('react-leaflet').then(m => {
  return function MapUpdaterComponent({ selectedParcel }: { selectedParcel: Parcel | null }) {
    const map = m.useMap()
    React.useEffect(() => {
      if (!selectedParcel) return
      import('leaflet').then(L => {
        try {
          if (selectedParcel.polygon_geojson) {
            const geojsonLayer = L.geoJSON(selectedParcel.polygon_geojson)
            const bounds = geojsonLayer.getBounds()
            if (bounds.isValid()) {
              map.flyToBounds(bounds, { padding: [50, 50], duration: 1.5, maxZoom: 18 })
            }
          } else if (selectedParcel.centroid_lat && selectedParcel.centroid_lng) {
            map.flyTo([selectedParcel.centroid_lat, selectedParcel.centroid_lng], 16, { duration: 1.5 })
          }
        } catch (e) {
          console.error('Map fly to error', e)
        }
      })
    }, [selectedParcel, map])
    return null
  }
}), { ssr: false })

const AutoBounds = dynamic(() => import('./AutoBounds'), { ssr: false })

// Dùng đúng field name từ API (polygon_geojson, không phải geometry)
type Parcel = {
  id: string
  parcel_code?: string
  name?: string
  status: string
  crop_type?: string
  polygon_geojson?: { type: string; coordinates: unknown[] } | null
  centroid_lat?: number | null
  centroid_lng?: number | null
  household?: { name?: string } | null
  area_ha?: number | null
  crop_cycles?: { crop_name?: string }[]
}

// Map DB status → màu sắc + nhãn tiếng Việt
const STATUS_CONFIG: Record<string, { fillColor: string; color: string; label: string }> = {
  ACTIVE:            { fillColor: '#16A34A', color: '#15803D', label: 'Đang canh tác' },
  DRAFT:             { fillColor: '#9CA3AF', color: '#6B7280', label: 'Khởi tạo' },
  HARVEST_APPROVED:  { fillColor: '#EA580C', color: '#C2410C', label: 'Đã duyệt thu hoạch' },
  HARVESTED:         { fillColor: '#2563EB', color: '#1D4ED8', label: 'Đã thu hoạch' },
  PENDING_APPROVAL:  { fillColor: '#CA8A04', color: '#A16207', label: 'Chờ duyệt' },
}

// Kiểm tra GeoJSON có tọa độ hợp lệ không
function hasValidGeometry(geojson?: { type: string; coordinates: unknown[] } | null): boolean {
  if (!geojson) return false
  if (!Array.isArray(geojson.coordinates) || geojson.coordinates.length === 0) return false
  const outerRing = geojson.coordinates[0]
  if (!Array.isArray(outerRing) || outerRing.length === 0) return false
  return true
}

export default function FarmZoneReadOnly() {
  const [parcels, setParcels] = useState<Parcel[]>([])
  const dbStatuses = Object.keys(STATUS_CONFIG)
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([...dbStatuses])
  const [cropTypes, setCropTypes] = useState<string[]>([])
  const [selectedCrop, setSelectedCrop] = useState<string>('all')
  const [selectedParcel, setSelectedParcel] = useState<Parcel | null>(null)

  const searchParams = useSearchParams()
  const householdId = searchParams.get('householdId')

  // Leaflet icon fix for Next.js (webpack replaces _getIconUrl)
  useEffect(() => {
    import('leaflet').then(L => {
      // @ts-ignore
      delete L.Icon.Default.prototype._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })
    })
  }, [])

  useEffect(() => {
    const url = householdId ? `/api/farm/parcels?household_id=${householdId}` : '/api/farm/parcels'
    fetch(url)
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(j => setParcels(j.data || []))
      .catch(() => setParcels([]))
  }, [householdId])

  useEffect(() => {
    const types = Array.from(new Set(parcels.map(p => p.crop_type).filter(Boolean))) as string[]
    setCropTypes(types)
  }, [parcels])

  // Chỉ hiển thị parcel có polygon hợp lệ
  const filtered = useMemo(() => {
    return parcels.filter(p => {
      const statusOk = selectedStatuses.length === 0 ? true : selectedStatuses.includes(p.status)
      const cropOk = selectedCrop === 'all' ? true : p.crop_type === selectedCrop
      const hasGeo = hasValidGeometry(p.polygon_geojson)
      return statusOk && cropOk && hasGeo
    })
  }, [parcels, selectedStatuses, selectedCrop])

  const totalParcels = parcels.length
  const drawnParcels = parcels.filter(p => hasValidGeometry(p.polygon_geojson)).length

  function toggleStatus(s: string) {
    setSelectedStatuses(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  function styleForFeature(feature: any) {
    const status = feature?.properties?.status
    const cfg = STATUS_CONFIG[status] || { fillColor: '#9CA3AF', color: '#6B7280' }
    return { color: cfg.color, weight: 2, fillColor: cfg.fillColor, fillOpacity: 0.4 }
  }

  function onEachFeature(feature: any, layer: any) {
    const props = feature.properties || {}
    const name = props.parcel_code || props.name || 'Thửa đất'
    const statusCfg = STATUS_CONFIG[props.status]
    const statusLabel = statusCfg?.label || props.status || '—'
    const crop = props.crop_type || '—'
    const owner = props.household?.name || '—'
    const area = props.area_ha != null ? `${props.area_ha} ha` : '—'
    const html = `<div style="min-width:180px;font-family:sans-serif">
      <strong style="font-size:1rem">${name}</strong>
      <div style="margin-top:6px;font-size:0.85rem">
        <div>📍 Trạng thái: <b>${statusLabel}</b></div>
        <div>🌾 Cây trồng: ${crop}</div>
        <div>👤 Nông hộ: ${owner}</div>
        <div>📐 Diện tích: ${area}</div>
      </div>
    </div>`
    layer.bindPopup(html)
  }

  function toGeoJSONFeature(p: Parcel) {
    return {
      type: 'Feature' as const,
      properties: {
        parcel_code: p.parcel_code,
        status: p.status,
        crop_type: p.crop_type,
        household: p.household,
        area_ha: p.area_ha,
      },
      geometry: p.polygon_geojson,
    }
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full min-h-[calc(100vh-100px)]">
      {/* Left Panel: Sidebar */}
      <div className="w-full lg:w-[380px] flex-shrink-0 flex flex-col gap-4">
        
        {/* Filter Card */}
        <div className="bg-[var(--color-surface-sunken)] rounded-xl border border-[var(--color-surface-border)] overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-[var(--color-surface-border)] bg-[var(--color-surface-base)] flex items-center justify-between">
            <h2 className="font-semibold text-[var(--color-ink-primary)]">Bộ lọc hiển thị</h2>
          </div>
          <div className="p-5 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--color-ink-secondary)]">Trạng thái</label>
              <div className="flex flex-wrap gap-2">
                {dbStatuses.map(s => (
                  <label key={s} className="flex items-center gap-1.5 text-sm cursor-pointer hover:opacity-80 transition-opacity">
                    <input type="checkbox" className="rounded text-[var(--color-primary)] focus:ring-[var(--color-primary)]" checked={selectedStatuses.includes(s)} onChange={() => toggleStatus(s)} />
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_CONFIG[s]?.fillColor }} />
                    <span className="text-[var(--color-ink-primary)]">{STATUS_CONFIG[s]?.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--color-ink-secondary)]">Cây trồng</label>
              <select value={selectedCrop} onChange={e => setSelectedCrop(e.target.value)} className="w-full px-3 py-2 bg-[var(--color-surface-base)] border border-[var(--color-surface-border)] rounded-lg text-sm text-[var(--color-ink-primary)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-colors">
                <option value="all">Tất cả cây trồng</option>
                {cropTypes.map(ct => <option key={ct} value={ct}>{ct}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Parcels List Card */}
        <div className="bg-[var(--color-surface-sunken)] rounded-xl border border-[var(--color-surface-border)] overflow-hidden shadow-sm flex flex-col h-[450px]">
          <div className="px-5 py-4 border-b border-[var(--color-surface-border)] bg-[var(--color-surface-base)] flex items-center justify-between">
            <h2 className="font-semibold text-[var(--color-ink-primary)]">Danh Sách Thửa Đất</h2>
            <span className="text-xs font-medium bg-[var(--color-surface-sunken)] px-2.5 py-1 rounded-full text-[var(--color-ink-secondary)]">
              {drawnParcels}/{totalParcels} đã vẽ
            </span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {filtered.length === 0 ? (
              <div className="text-center py-12 text-[var(--color-ink-tertiary)] flex flex-col items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-[var(--color-surface-base)] flex items-center justify-center">
                  <MapPin className="h-5 w-5" />
                </div>
                <p className="text-sm">Không tìm thấy thửa đất nào</p>
              </div>
            ) : (
              filtered.map(p => {
                const name = p.parcel_code || p.name || 'Thửa đất chưa đặt tên'
                const statusCfg = STATUS_CONFIG[p.status]
                const statusLabel = statusCfg?.label || p.status || '—'
                return (
                  <div 
                    key={p.id} 
                    onClick={() => setSelectedParcel(p)}
                    className="cursor-pointer bg-[var(--color-surface-base)] p-4 rounded-lg border border-[var(--color-surface-border)] hover:border-[var(--color-primary)] hover:shadow-md transition-all group"
                  >
                    <div className="flex justify-between items-start gap-4 mb-2">
                      <div>
                        <h3 className="font-medium text-[var(--color-ink-primary)] line-clamp-1 group-hover:text-[var(--color-primary)] transition-colors" title={name}>{name}</h3>
                        <span 
                          className="inline-block mt-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: `${statusCfg?.fillColor}20`, color: statusCfg?.color }}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-1.5 text-[var(--color-primary)] bg-[var(--color-primary)]/10 rounded-md transition-colors" title="Định vị trên bản đồ">
                          <Target className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="space-y-1.5 text-xs text-[var(--color-ink-secondary)] mt-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium min-w-[32px]">Chủ:</span>
                        <span className="line-clamp-1">{p.household?.name || '—'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium min-w-[32px]">Loại:</span>
                        <span>{p.crop_type || '—'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium min-w-[32px]">S:</span>
                        <span>{p.area_ha != null ? `${p.area_ha} ha` : '—'}</span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Right Panel: Map */}
      <div className="flex-1 bg-[var(--color-surface-sunken)] rounded-xl border border-[var(--color-surface-border)] overflow-hidden shadow-sm relative h-[600px] lg:h-auto">
        {/* We add a style tag to fix Leaflet tooltips globally within this block to avoid module.css */}
        <style>{`
          .leaflet-tooltip.transparent-tooltip {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
          }
          .leaflet-tooltip.transparent-tooltip::before {
            display: none !important;
          }
        `}</style>

        <MapContainer center={[10.0, 106.0]} zoom={9} className="h-full w-full absolute inset-0 z-0">
          {/* @ts-ignore */}
          <LayersControl position="topright">
            {/* @ts-ignore */}
            <BaseLayer checked name="Bản đồ đường phố (OSM)">
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap contributors"
              />
            </BaseLayer>
            {/* @ts-ignore */}
            <BaseLayer name="Bản đồ Vệ tinh (Esri)">
              <TileLayer
                attribution='Tiles &copy; Esri'
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              />
            </BaseLayer>
          </LayersControl>
          
          <AutoBounds parcels={filtered} />
          <MapUpdater selectedParcel={selectedParcel} />

          {filtered.map(p => (
            <GeoJSON
              key={p.id}
              data={toGeoJSONFeature(p) as any}
              style={styleForFeature}
              onEachFeature={onEachFeature}
            >
              <Tooltip permanent direction="center" className="transparent-tooltip">
                <div className="flex items-center justify-center">
                  <span className="text-[20px] drop-shadow-md">🌱</span>
                </div>
              </Tooltip>
            </GeoJSON>
          ))}
        </MapContainer>

        {drawnParcels === 0 && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl p-6 text-center shadow-xl z-[1000] pointer-events-auto">
            <div className="text-4xl mb-2">🗺️</div>
            <p className="m-0 text-base text-[var(--color-ink-primary)]">
              <strong>Chưa có ranh giới thửa đất nào</strong>
            </p>
            <p className="mt-2 mb-4 text-sm text-[var(--color-ink-secondary)] max-w-[300px] mx-auto">
              Các thửa đất của {householdId ? 'nông hộ này' : 'hợp tác xã'} hiện chưa được vẽ ranh giới trên bản đồ. Bạn cần thiết lập vùng trồng để hiển thị.
            </p>
            <a 
              href={householdId ? `/officer/farm-zones/setup?householdId=${householdId}` : "/officer/farm-zones/setup"}
              className="inline-block px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium hover:bg-[var(--color-primary-hover)] transition-colors text-decoration-none"
            >
              Vẽ ranh giới ngay
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
