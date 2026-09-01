// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

"use client"

import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import 'leaflet/dist/leaflet.css'
import styles from './FarmZoneReadOnly.module.css'

// Dynamic imports for react-leaflet to ensure ssr:false behavior per requirement
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false })
const GeoJSON = dynamic(() => import('react-leaflet').then(m => m.GeoJSON), { ssr: false })
const LayersControl = dynamic(() => import('react-leaflet').then(m => m.LayersControl), { ssr: false })
const BaseLayer = dynamic(() => import('react-leaflet').then(m => m.LayersControl.BaseLayer), { ssr: false })
const Tooltip = dynamic<any>(() => import('react-leaflet').then(m => (m as any).Tooltip), { ssr: false })

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

// Kiểm tra GeoJSON có tọa độ hợp lệ không (tránh oval lạ khi coordinates: [])
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

  const searchParams = useSearchParams()
  const householdId = searchParams.get('householdId')

  // Leaflet icon fix for Next.js (webpack replaces _getIconUrl)
  useEffect(() => {
    import('leaflet').then(L => {
      // @ts-ignore — Leaflet webpack workaround (AD-18)
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

  // Tạo GeoJSON Feature từ parcel để thêm properties
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


// Để đơn giản, ta sẽ gọi useMap() bên trong component con.
const AutoBounds = dynamic(() => import('./AutoBounds'), { ssr: false })

  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        <div className={styles.filterGroup}>
          <strong>Trạng thái</strong>
          <div className={styles.checkboxRow}>
            {dbStatuses.map(s => (
              <label key={s} className={styles.checkboxLabel}>
                <input type="checkbox" checked={selectedStatuses.includes(s)} onChange={() => toggleStatus(s)} />
                {' '}<span style={{
                  display:'inline-block', width:10, height:10, borderRadius:'50%',
                  backgroundColor: STATUS_CONFIG[s]?.fillColor, marginRight:4
                }} />
                {STATUS_CONFIG[s]?.label}
              </label>
            ))}
          </div>
        </div>

        <div className={styles.filterGroup}>
          <strong>Cây trồng</strong>
          <select value={selectedCrop} onChange={e => setSelectedCrop(e.target.value)}>
            <option value="all">Tất cả</option>
            {cropTypes.map(ct => <option key={ct} value={ct}>{ct}</option>)}
          </select>
        </div>

        <div style={{ fontSize: '0.82rem', color: '#6b7280', marginLeft: 'auto' }}>
          {drawnParcels}/{totalParcels} thửa đã vẽ ranh giới
        </div>
      </div>

      <div className={styles.mapContainer}>
        <MapContainer center={[10.0, 106.0]} zoom={9} style={{ height: '100%', width: '100%' }}>
          {/* @ts-ignore */}
          <LayersControl position="topright">
            {/* @ts-ignore */}
            <BaseLayer checked name="Bản đồ Vệ tinh (Esri)">
              <TileLayer
                attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              />
            </BaseLayer>
            {/* @ts-ignore */}
            <BaseLayer name="Bản đồ đường phố (OSM)">
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="© OpenStreetMap contributors"
              />
            </BaseLayer>
          </LayersControl>
          <AutoBounds parcels={filtered} />
          {filtered.map(p => {

            return (
              <GeoJSON
                key={p.id}
                data={toGeoJSONFeature(p) as any}
                style={styleForFeature}
                onEachFeature={onEachFeature}
              >
                <Tooltip permanent direction="center" className={styles.parcelTooltip}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '20px', textShadow: '0 0 4px rgba(0,0,0,0.5)' }}>🌱</span>
                  </div>
                </Tooltip>
              </GeoJSON>
            )
          })}
        </MapContainer>
        {drawnParcels === 0 && (
          <div style={{
            position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
            background:'white', borderRadius:8, padding:'1.5rem', textAlign:'center',
            boxShadow:'0 4px 12px rgba(0,0,0,0.15)', zIndex:1000, pointerEvents:'auto'
          }}>
            <div style={{ fontSize:'2rem', marginBottom:'0.5rem' }}>🗺️</div>
            <p style={{ margin:'0', fontSize:'1rem', color:'#111827' }}>
              <strong>Chưa có ranh giới thửa đất nào</strong>
            </p>
            <p style={{ margin:'0.5rem 0 1rem', fontSize:'0.85rem', color:'#6b7280', maxWidth: '300px' }}>
              Các thửa đất của {householdId ? 'nông hộ này' : 'hợp tác xã'} hiện chưa được vẽ ranh giới trên bản đồ. Bạn cần thiết lập vùng trồng để hiển thị.
            </p>
            <a 
              href={householdId ? `/officer/farm-zones/setup?householdId=${householdId}` : "/officer/farm-zones/setup"}
              style={{
                display: 'inline-block', padding: '8px 16px', backgroundColor: '#16A34A', 
                color: 'white', borderRadius: '6px', fontSize: '0.9rem', fontWeight: 500, textDecoration: 'none'
              }}
            >
              Vẽ ranh giới ngay
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

