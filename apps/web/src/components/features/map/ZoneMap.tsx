// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect, useState } from 'react'
import { MapContainer, TileLayer, GeoJSON, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { ParcelSummary } from '@/domain/farm/ports/ParcelPort'
import Image from 'next/image'

interface ZoneMapProps {
  parcels: ParcelSummary[]
}

const mapStyle = { height: '100%', width: '100%', borderRadius: '0.5rem' }

// Component con để fetch ảnh Farm View khi Popup được mở
function ParcelPopupContent({ parcel }: { parcel: ParcelSummary }) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoDate, setPhotoDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    const fetchPhoto = async () => {
      try {
        const res = await fetch(`/api/parcels/${parcel.id}/latest-photo`)
        if (res.ok) {
          const data = await res.json()
          if (isMounted) {
            setPhotoUrl(data.photoUrl)
            if (data.date) {
              setPhotoDate(new Date(data.date).toLocaleDateString('vi-VN'))
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch farm view photo:', err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    fetchPhoto()
    return () => { isMounted = false }
  }, [parcel.id])

  return (
    <div style={{ minWidth: '200px' }}>
      <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 'bold' }}>Thông tin thửa đất</h3>
      <p style={{ margin: '4px 0' }}><strong>Mã vùng:</strong> {parcel.parcel_code}</p>
      <p style={{ margin: '4px 0' }}><strong>Nông hộ:</strong> {parcel.household?.name || 'N/A'}</p>
      <p style={{ margin: '4px 0' }}><strong>Cây trồng:</strong> {parcel.crop_type || 'Chưa có'}</p>
      <p style={{ margin: '4px 0' }}><strong>Diện tích:</strong> {parcel.area_ha} ha</p>
      <p style={{ margin: '4px 0' }}><strong>Trạng thái:</strong> {parcel.status}</p>
      
      <div style={{ marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
        <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 'bold' }}>📸 Thực địa (Farm View)</h4>
        {loading ? (
          <p style={{ fontSize: '12px', color: 'gray', margin: 0 }}>Đang tải ảnh thực địa...</p>
        ) : photoUrl ? (
          <div>
            <div style={{ position: 'relative', width: '100%', height: '150px', borderRadius: '4px', overflow: 'hidden' }}>
              <Image 
                src={photoUrl} 
                alt={`Farm View ${parcel.parcel_code}`} 
                fill 
                style={{ objectFit: 'cover' }} 
              />
            </div>
            {photoDate && <p style={{ fontSize: '11px', color: 'gray', marginTop: '4px', marginBottom: 0 }}>Chụp ngày: {photoDate}</p>}
          </div>
        ) : (
          <div style={{ width: '100%', height: '100px', backgroundColor: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>
            <p style={{ fontSize: '12px', color: 'gray', margin: 0 }}>Chưa có ảnh nhật ký</p>
          </div>
        )}
      </div>
    </div>
  )
}

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
        attribution='&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      />
      {parcels.map(parcel => (
        parcel.polygon_geojson ? (
          <GeoJSON 
            key={parcel.id} 
            data={parcel.polygon_geojson as any}
            pathOptions={{ color: '#00ff00', weight: 3, fillColor: '#00ff00', fillOpacity: 0.2 }}
          >
            <Popup>
              <ParcelPopupContent parcel={parcel} />
            </Popup>
          </GeoJSON>
        ) : null
      ))}
    </MapContainer>
  )
}
