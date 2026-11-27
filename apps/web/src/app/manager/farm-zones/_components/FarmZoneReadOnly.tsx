// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

"use client"

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPin, Target, Map } from 'lucide-react'
import { escapeHtml } from '@/lib/sanitize'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import table from '@/components/features/dashboard/dashboard.module.css'
import kit from '@/components/features/dashboard/page-kit.module.css'
import sample from '@/components/features/sample/sample.module.css'
import { SampleTag } from '@/components/features/sample/SampleTag'
import { DEFAULT_MAP_VIEW, PARCEL_STATUS_CONFIG as STATUS_CONFIG } from '@/lib/map-config'
import { addMapBaseLayers } from '@/components/features/map/map-layers'
import mapStyles from '@/components/features/map/ZoneMap.module.css'

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
  const [loadFailed, setLoadFailed] = useState(false)
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
      ...DEFAULT_MAP_VIEW,
      minZoom: 6,
      maxZoom: 24,
      maxBounds: [
        [8.0, 102.0],
        [23.5, 109.5]
      ],
      maxBoundsViscosity: 1.0,
    })

    addMapBaseLayers(map)

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
    fetchJson<{ data?: Parcel[] }>(url)
      .then(j => {
        setParcels(j.data || [])
        setLoadFailed(false)
      })
      .catch(() => {
        setParcels([])
        setLoadFailed(true)
      })
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
          const tooltipContent = `<div style="display:flex;align-items:center;justify-content:center;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/></svg></div>`
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

  // Centroids still locate real parcels before boundaries have been drawn.
  useEffect(() => {
    if (!mapRef.current || parcels.some(p => hasValidGeometry(p.polygon_geojson))) return
    const points = parcels.filter(p => Number.isFinite(p.centroid_lat) && Number.isFinite(p.centroid_lng))
      .map(p => [p.centroid_lat!, p.centroid_lng!] as [number, number])
    if (points.length) mapRef.current.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: DEFAULT_MAP_VIEW.zoom })
  }, [parcels])

  // Sync selected parcel focus
  useEffect(() => {
    if (!selectedParcel || !mapRef.current) return
    try {
      if (hasValidGeometry(selectedParcel.polygon_geojson)) {
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
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.DRAFT
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
        <div><span style="color:var(--color-ink-secondary)">Trạng thái:</span> <b>${statusLabel}</b></div>
        <div><span style="color:var(--color-ink-secondary)">Cây trồng:</span> ${crop}</div>
        <div><span style="color:var(--color-ink-secondary)">Nông hộ:</span> ${owner}</div>
        <div><span style="color:var(--color-ink-secondary)">Diện tích:</span> ${area}</div>
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

  // The table lists every parcel the filters allow, drawn on the map or not.
  const listed = parcels.filter(p => (selectedStatuses.length === 0 || selectedStatuses.includes(p.status)) && (selectedCrop === 'all' || p.crop_type === selectedCrop))

  function exportGeoJson() {
    const collection = { type: 'FeatureCollection', features: filtered.map(toGeoJSONFeature) }
    const url = URL.createObjectURL(new Blob([JSON.stringify(collection)], { type: 'application/geo+json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'vung-trong.geojson'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
    <div className={mapStyles.toolbar}>
      <dl className={mapStyles.figures}>
        <div><dt>Thửa đất</dt><dd>{totalParcels}</dd></div>
        <div><dt>Đã vẽ ranh giới</dt><dd>{drawnParcels}</dd></div>
        <div><dt>Diện tích (ha)</dt><dd>{parcels.reduce((sum, p) => sum + (p.area_ha ?? 0), 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}</dd></div>
      </dl>
      <span className="text-xs text-ink-secondary">Chọn thửa để xem vị trí và thông tin</span>
    </div>
    <div className={mapStyles.workspace}>
      <div className={mapStyles.sidebar}>
        
        {/* Filter Card */}
        <div className="bg-[var(--color-surface-sunken)] rounded-xl border border-[var(--color-border-default)] overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-[var(--color-border-default)] bg-[var(--color-surface-card)] flex items-center justify-between">
            <h2 className="font-semibold text-[var(--color-ink-primary)]">Bộ lọc hiển thị</h2>
          </div>
          <div className="p-3 space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--color-ink-secondary)]">Trạng thái</label>
              <div className="flex flex-wrap gap-2">
                {dbStatuses.map(s => (
                  <label key={s} className={mapStyles.chip}>
                    <input type="checkbox" className="rounded text-[var(--color-primary)] focus:ring-[var(--color-primary)]" checked={selectedStatuses.includes(s)} onChange={() => toggleStatus(s)} />
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_CONFIG[s]?.fillColor }} />
                    <span className="text-[var(--color-ink-primary)]">{STATUS_CONFIG[s]?.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="map-crop" className="text-xs font-medium text-[var(--color-ink-secondary)]">Cây trồng</label>
              <select id="map-crop" value={selectedCrop} onChange={e => setSelectedCrop(e.target.value)} className="w-full px-3 py-2 bg-[var(--color-surface-card)] border border-[var(--color-border-default)] rounded-lg text-sm text-[var(--color-ink-primary)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-colors">
                <option value="all">Tất cả cây trồng</option>
                {cropTypes.map(ct => <option key={ct} value={ct}>{ct}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Parcels List Card */}
        <div className={mapStyles.parcelList}>
          <div className="px-5 py-4 border-b border-[var(--color-border-default)] bg-[var(--color-surface-card)] flex items-center justify-between">
            <h2 className="font-semibold text-[var(--color-ink-primary)]">Danh Sách Thửa Đất</h2>
            <span className="text-xs font-medium bg-[var(--color-surface-sunken)] px-2.5 py-1 rounded-full text-[var(--color-ink-secondary)]">
              {drawnParcels}/{totalParcels} đã vẽ
            </span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {listed.length === 0 ? (
              <div className="text-center py-12 text-[var(--color-ink-tertiary)] flex flex-col items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-[var(--color-surface-card)] flex items-center justify-center">
                  <MapPin className="h-5 w-5" />
                </div>
                <p className="text-sm">{loadFailed ? LOAD_FAILED_MESSAGE : 'Không tìm thấy thửa đất nào'}</p>
              </div>
            ) : (
              listed.map(p => {
                const name = p.parcel_code || p.name || 'Thửa đất chưa đặt tên'
                const statusCfg = STATUS_CONFIG[p.status]
                const statusLabel = statusCfg?.label || p.status || '—'
                return (
                  <div 
                    key={p.id} 
                    className="bg-[var(--color-surface-card)] p-3 rounded-lg border border-[var(--color-border-default)] hover:border-[var(--color-primary)] group"
                  >
                    <div className="flex justify-between items-start gap-4 mb-2">
                      <div>
                        <h3 className="font-medium text-[var(--color-ink-primary)] line-clamp-1 group-hover:text-[var(--color-primary)] transition-colors" title={name}>{name}</h3>
                        <span 
                          className="inline-block mt-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: 'var(--color-surface-sunken)', color: 'var(--color-ink-primary)' }}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => setSelectedParcel(p)} className="p-3 text-[var(--color-primary)] bg-[var(--color-primary)]/10 rounded-md transition-colors" title="Định vị trên bản đồ" aria-label={`Định vị ${name} trên bản đồ`}>
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

      <div className={mapStyles.mapFrame} aria-label="Bản đồ thửa đất">
        <div ref={mapContainerRef} className={mapStyles.mapCanvas} />
        <div className={mapStyles.legend} aria-label="Chú giải trạng thái thửa">
          {dbStatuses.map(status => <span key={status}><i className={mapStyles.swatch} style={{ background: STATUS_CONFIG[status].color }} aria-hidden="true" />{STATUS_CONFIG[status].label}</span>)}
        </div>

        {!loadFailed && drawnParcels === 0 && (
          <div className={mapStyles.emptyBanner}>
            <p className="flex items-center gap-2"><Map size={16} aria-hidden="true" /><strong>Chưa có ranh giới thửa đất nào</strong></p>
            <a 
              href={householdId ? `/officer/farm-zones/setup?householdId=${householdId}` : "/officer/farm-zones/setup"}
              className="underline underline-offset-4"
            >
              Vẽ ranh giới ngay
            </a>
          </div>
        )}
      </div>
    </div>

    {/* Without drawn boundaries the map is empty: show the real parcels as blocks, and say it is not a map. */}
    {drawnParcels === 0 && listed.length > 0 && (
      <section className={sample.card} aria-label="Sơ đồ thửa minh hoạ" style={{ marginTop: 16 }}>
        <div className={sample.head}>
          <h2>Sơ đồ thửa</h2>
          <SampleTag />
          <span>Vị trí minh hoạ, không đúng thực tế</span>
        </div>
        <div className={`${sample.blocks} ${mapStyles.schematic}`}>
          {listed.map(p => (
            <div key={p.id} className={`${sample.block} ${sample[p.status] ?? ''}`} style={{ flex: `${Math.max(p.area_ha ?? 0.5, 0.3)} 1 90px` }}>
              <strong>{p.parcel_code || p.name}</strong>
              <span>{STATUS_CONFIG[p.status]?.label ?? p.status}</span>
            </div>
          ))}
        </div>
      </section>
    )}

    {listed.length > 0 && (
      <section className={kit.card} aria-label="Danh sách thửa" style={{ marginTop: 16 }}>
        <div className={kit.toolbar} style={{ justifyContent: 'space-between' }}>
          <strong>Danh sách thửa · {listed.length}</strong>
          <button type="button" className={kit.secondary} onClick={exportGeoJson} disabled={filtered.length === 0}>Xuất GeoJSON</button>
        </div>
        <div className={table.tableWrap}>
          <table className={table.table}>
            <thead>
              <tr><th>Mã thửa</th><th>Nông hộ</th><th>Giống</th><th>Diện tích</th><th>Trạng thái</th></tr>
            </thead>
            <tbody>
              {listed.map(p => (
                <tr key={p.id} className={kit.clickable} onClick={() => setSelectedParcel(p)}>
                  <td className={table.code}>{p.parcel_code || p.name || '—'}</td>
                  <td>{p.household?.name || '—'}</td>
                  <td>{p.crop_type || '—'}</td>
                  <td>{p.area_ha != null ? `${p.area_ha.toLocaleString('vi-VN')} ha` : '—'}</td>
                  <td>{STATUS_CONFIG[p.status]?.label ?? p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    )}
    </>
  )
}
