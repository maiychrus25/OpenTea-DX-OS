// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

"use client"

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPin, Target, Map } from 'lucide-react'
import { escapeHtml } from '@/lib/sanitize'

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

  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null)

  // Initialize pure Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    delete (L.Icon.Default.prototype as any)._getIconUrl
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    })

    const map = L.map(mapContainerRef.current, {
      center: [10.0, 106.0],
      zoom: 9,
      minZoom: 6,
      maxBounds: [
        [8.0, 102.0],
        [23.5, 109.5]
      ],
      maxBoundsViscosity: 1.0,
    })

    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map)

    const esriLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri'
    })

    L.control.layers({
      'Bản đồ đường phố (OSM)': osmLayer,
      'Bản đồ Vệ tinh (Esri)': esriLayer
    }, undefined, { position: 'topright' }).addTo(map)

    mapRef.current = map
    const timer = setTimeout(() => map.invalidateSize(), 250)

    const handleResize = () => {
      map.invalidateSize()
    }
    window.addEventListener('resize', handleResize)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', handleResize)
      map.remove()
      mapRef.current = null
      geoJsonLayerRef.current = null
    }
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

  // Sync GeoJSON polygons on filtered parcels change
  useEffect(() => {
    if (!mapRef.current) return

    if (geoJsonLayerRef.current) {
      geoJsonLayerRef.current.remove()
      geoJsonLayerRef.current = null
    }

    if (filtered.length === 0) return

    try {
      const geojsonFeatures = filtered.map(toGeoJSONFeature)
      const geoLayer = L.geoJSON(geojsonFeatures as any, {
        style: styleForFeature,
        onEachFeature: (feature, layer) => {
          onEachFeature(feature, layer)
          const tooltipContent = `<div style="display:flex;align-items:center;justify-content:center;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/></svg></div>`
          layer.bindTooltip(tooltipContent, { permanent: true, direction: 'center', className: 'transparent-tooltip' })
        }
      }).addTo(mapRef.current)

      geoJsonLayerRef.current = geoLayer

      const bounds = geoLayer.getBounds()
      if (bounds.isValid()) {
        mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 19 })
      }
    } catch (e) {
      console.error('Error rendering parcels GeoJSON layer:', e)
    }
  }, [filtered])

  // Sync selected parcel focus
  useEffect(() => {
    if (!selectedParcel || !mapRef.current) return
    try {
      if (selectedParcel.polygon_geojson) {
        const geojsonLayer = L.geoJSON(selectedParcel.polygon_geojson as any)
        const bounds = geojsonLayer.getBounds()
        if (bounds.isValid()) {
          mapRef.current.flyToBounds(bounds, { padding: [50, 50], duration: 1.5, maxZoom: 18 })
        }
      } else if (selectedParcel.centroid_lat && selectedParcel.centroid_lng) {
        mapRef.current.flyTo([selectedParcel.centroid_lat, selectedParcel.centroid_lng], 16, { duration: 1.5 })
      }
    } catch (e) {
      console.error('Map fly to error', e)
    }
  }, [selectedParcel])

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
    const name = escapeHtml(props.parcel_code || props.name || 'Thửa đất')
    const statusCfg = STATUS_CONFIG[props.status]
    const statusLabel = escapeHtml(statusCfg?.label || props.status || '—')
    const crop = escapeHtml(props.crop_type || '—')
    const owner = escapeHtml(props.household?.name || '—')
    const area = escapeHtml(props.area_ha != null ? `${props.area_ha} ha` : '—')
    const html = `<div style="min-width:180px;font-family:sans-serif">
      <strong style="font-size:1rem">${name}</strong>
      <div style="margin-top:6px;font-size:0.85rem;line-height:1.5">
        <div><span style="color:#64748b">Trạng thái:</span> <b>${statusLabel}</b></div>
        <div><span style="color:#64748b">Cây trồng:</span> ${crop}</div>
        <div><span style="color:#64748b">Nông hộ:</span> ${owner}</div>
        <div><span style="color:#64748b">Diện tích:</span> ${area}</div>
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

        <div ref={mapContainerRef} className="h-full w-full absolute inset-0 z-0" />

        {drawnParcels === 0 && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl p-6 text-center shadow-xl z-[1000] pointer-events-auto">
            <Map className="w-10 h-10 mx-auto mb-2 text-slate-400" />
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
