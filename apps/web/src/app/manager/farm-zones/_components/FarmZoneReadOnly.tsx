"use client"

import React, { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import styles from './FarmZoneReadOnly.module.css'

// Dynamic imports for react-leaflet to ensure ssr:false behavior per requirement
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false })
const GeoJSON = dynamic(() => import('react-leaflet').then(m => m.GeoJSON), { ssr: false })

type Parcel = {
  id: string
  name?: string
  status: 'Sowing' | 'Tending' | 'Harvest-Approved' | 'Harvested' | string
  crop_type?: string
  geometry: GeoJSON.Geometry
  owner?: string
  area?: number
}

const STATUS_COLORS: Record<string, { fillColor: string; color: string }> = {
  Sowing: { fillColor: '#16A34A', color: '#15803D' },
  Tending: { fillColor: '#CA8A04', color: '#A16207' },
  'Harvest-Approved': { fillColor: '#EA580C', color: '#C2410C' },
  Harvested: { fillColor: '#2563EB', color: '#1D4ED8' },
}

export default function FarmZoneReadOnly() {
  const [parcels, setParcels] = useState<Parcel[]>([])
  const statuses = ['Sowing','Tending','Harvest-Approved','Harvested']
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([...statuses])
  const [cropTypes, setCropTypes] = useState<string[]>([])
  const [selectedCrop, setSelectedCrop] = useState<string>('all')

  useEffect(() => {
    fetch('/api/farm/parcels')
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(j => setParcels(j.data || []))
      .catch(() => setParcels([]))
  }, [])

  useEffect(() => {
    const types = Array.from(new Set(parcels.map(p => p.crop_type).filter(Boolean))) as string[]
    setCropTypes(types)
  }, [parcels])

  const filtered = useMemo(() => {
    return parcels.filter(p => {
      const statusOk = selectedStatuses.length === 0 ? true : selectedStatuses.includes(p.status)
      const cropOk = selectedCrop === 'all' ? true : p.crop_type === selectedCrop
      return statusOk && cropOk
    })
  }, [parcels, selectedStatuses, selectedCrop])

  function toggleStatus(s: string) {
    setSelectedStatuses(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  function styleForFeature(feature: any) {
    const status = feature?.properties?.status
    const colors = STATUS_COLORS[status] || { fillColor: '#9CA3AF', color: '#6B7280' }
    return {
      color: colors.color,
      weight: 2,
      fillColor: colors.fillColor,
      fillOpacity: 0.4,
    }
  }

  function onEachFeature(feature: any, layer: any) {
    const props = feature.properties || {}
    const name = props.name || props.id || 'Parcel'
    const status = props.status || 'Unknown'
    const crop = props.crop_type || '—'
    const owner = props.owner || '—'
    const area = props.area != null ? `${props.area} ha` : '—'
    const html = `<div style="min-width:160px"><strong>${name}</strong><div>Status: ${status}</div><div>Crop: ${crop}</div><div>Owner: ${owner}</div><div>Area: ${area}</div></div>`
    layer.bindPopup(html)
  }

  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        <div className={styles.filterGroup}>
          <strong>Status</strong>
          <div className={styles.checkboxRow}>
            {statuses.map(s => (
              <label key={s} className={styles.checkboxLabel}>
                <input type="checkbox" checked={selectedStatuses.includes(s)} onChange={() => toggleStatus(s)} /> {s}
              </label>
            ))}
          </div>
        </div>

        <div className={styles.filterGroup}>
          <strong>Crop Type</strong>
          <select value={selectedCrop} onChange={e => setSelectedCrop(e.target.value)}>
            <option value="all">All</option>
            {cropTypes.map(ct => <option key={ct} value={ct}>{ct}</option>)}
          </select>
        </div>
      </div>

      <div className={styles.mapContainer}>
        <MapContainer center={[10.0, 106.7]} zoom={7} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {filtered.map(p => (
            <GeoJSON key={p.id} data={p.geometry as any} style={styleForFeature} onEachFeature={onEachFeature} />
          ))}
        </MapContainer>
      </div>
    </div>
  )
}
