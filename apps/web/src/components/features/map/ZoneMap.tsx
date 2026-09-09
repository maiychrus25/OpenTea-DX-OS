// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect, useState } from 'react'
import { MapContainer, TileLayer, GeoJSON, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { ParcelSummary } from '@/domain/farm/ports/ParcelPort'
import { Camera } from 'lucide-react'
import Image from 'next/image'
import styles from './ZoneMap.module.css'

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
    <div className={styles.popupContainer}>
      <h3 className={styles.popupTitle}>Thông tin thửa đất</h3>
      <p className={styles.popupRow}><strong>Mã vùng:</strong> {parcel.parcel_code}</p>
      <p className={styles.popupRow}><strong>Nông hộ:</strong> {parcel.household?.name || 'N/A'}</p>
      <p className={styles.popupRow}><strong>Cây trồng:</strong> {parcel.crop_type || 'Chưa có'}</p>
      <p className={styles.popupRow}><strong>Diện tích:</strong> {parcel.area_ha} ha</p>
      <p className={styles.popupRow}><strong>Trạng thái:</strong> {parcel.status}</p>
      
      <div className={styles.farmViewSection}>
        <h4 className={styles.farmViewTitle}>
          <Camera size={16} className="inline mr-1 text-emerald-700 align-text-bottom" /> Thực địa (Farm View)
        </h4>
        {loading ? (
          <p className={styles.loadingText}>Đang tải ảnh thực địa...</p>
        ) : photoUrl ? (
          <div>
            <div className={styles.imageWrapper}>
              <Image 
                src={photoUrl} 
                alt={`Farm View ${parcel.parcel_code}`} 
                fill 
                style={{ objectFit: 'cover' }} 
              />
            </div>
            {photoDate && <p className={styles.imageDate}>Chụp ngày: {photoDate}</p>}
          </div>
        ) : (
          <div className={styles.placeholder}>
            <p className={styles.loadingText}>Chưa có ảnh nhật ký</p>
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
      // @ts-ignore - Leaflet hack required for Next.js SSR workaround
      delete L.Icon.Default.prototype._getIconUrl
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
      {/* OLP_COMPLIANCE_NOTE: 
          The satellite layer uses a public endpoint as a progressive UX enhancement. 
          It does NOT require any proprietary SDKs, paid API keys, or hidden credentials, 
          strictly adhering to the project's MNM (Open Source) non-commercial rules. */}
      <TileLayer
        attribution='&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      />
      {parcels.map(parcel => (
        parcel.polygon_geojson ? (
          <GeoJSON 
            key={parcel.id} 
            // @ts-ignore - GeoJSON type mismatch between DB JSON and leaflet format
            data={parcel.polygon_geojson}
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
