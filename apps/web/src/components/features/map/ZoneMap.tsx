// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect, useState } from 'react'
import { MapContainer, TileLayer, GeoJSON, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { ParcelSummary } from '@/domain/farm/ports/ParcelPort'

interface ZoneMapProps {
  parcels: ParcelSummary[]
}

const mapStyle = { height: '100%', width: '100%', borderRadius: '0.5rem' }

export default function ZoneMap({ parcels }: ZoneMapProps) {
  const [isMounted, setIsMounted] = useState(false)
  
  useEffect(() => {
    setIsMounted(true)
    // Leaflet icon fix for Next.js
    import('leaflet').then(L => {
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })
    })
  }, [])

  if (!isMounted) return <div style={{ height: '400px', backgroundColor: 'var(--card)' }} />

  let center: [number, number] = [10.762622, 106.660172] // Default HCM
  const validParcels = parcels.filter(p => p.centroid_lat && p.centroid_lng)
  if (validParcels.length > 0) {
    center = [validParcels[0].centroid_lat!, validParcels[0].centroid_lng!]
  }

  // Khóa vùng kéo bản đồ (Giới hạn trong lãnh thổ đất liền/gần bờ Việt Nam)
  // Tránh kéo ra vùng biển có label quốc tế nhạy cảm
  const VIETNAM_BOUNDS: import('leaflet').LatLngBoundsLiteral = [
    [8.0, 102.0], // Tây Nam
    [23.5, 109.5] // Đông Bắc
  ];

  return (
    <MapContainer 
      center={center} 
      zoom={13} 
      minZoom={6}
      maxBounds={VIETNAM_BOUNDS}
      maxBoundsViscosity={1.0}
      style={mapStyle}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {parcels.map(parcel => (
        parcel.polygon_geojson ? (
          <GeoJSON 
            key={parcel.id} 
            data={parcel.polygon_geojson as any}
            pathOptions={{ color: 'var(--primary)', weight: 2, fillColor: 'var(--primary)', fillOpacity: 0.2 }}
          >
            <Popup>
              <div>
                <p><strong>Mã vùng:</strong> {parcel.parcel_code}</p>
                <p><strong>Nông hộ:</strong> {parcel.household?.name || 'N/A'}</p>
                <p><strong>Cây trồng:</strong> {parcel.crop_type || 'Chưa có'}</p>
                <p><strong>Diện tích:</strong> {parcel.area_ha} ha</p>
                <p><strong>Trạng thái:</strong> {parcel.status}</p>
              </div>
            </Popup>
          </GeoJSON>
        ) : null
      ))}
    </MapContainer>
  )
}
