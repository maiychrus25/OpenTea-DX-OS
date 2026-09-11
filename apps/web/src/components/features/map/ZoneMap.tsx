// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ParcelSummary } from '@/domain/farm/ports/ParcelPort'
import { escapeHtml } from '@/lib/sanitize'
import styles from './ZoneMap.module.css'

interface ZoneMapProps {
  parcels: ParcelSummary[]
}

const mapStyle = { height: '100%', width: '100%', borderRadius: '0.5rem' }

// Khóa vùng kéo bản đồ (Giới hạn trong lãnh thổ đất liền/gần bờ Việt Nam)
const VIETNAM_BOUNDS: L.LatLngBoundsLiteral = [
  [8.0, 102.0], // Tây Nam
  [23.5, 109.5] // Đông Bắc
]

export default function ZoneMap({ parcels }: ZoneMapProps) {
  const [isMounted, setIsMounted] = useState(false)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (!isMounted || !mapContainerRef.current || mapRef.current) return

    // Fix default Leaflet icon path
    delete (L.Icon.Default.prototype as any)._getIconUrl
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    })

    let center: [number, number] = [10.762622, 106.660172] // Default HCM
    const validParcels = parcels.filter(p => p.centroid_lat && p.centroid_lng)
    if (validParcels.length > 0) {
      center = [validParcels[0].centroid_lat!, validParcels[0].centroid_lng!]
    }

    const map = L.map(mapContainerRef.current, {
      center,
      zoom: 13,
      minZoom: 6,
      maxBounds: VIETNAM_BOUNDS,
      maxBoundsViscosity: 1.0,
    })

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    }).addTo(map)

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
  }, [isMounted, parcels])

  // Render polygons GeoJSON
  useEffect(() => {
    if (!mapRef.current) return

    if (geoJsonLayerRef.current) {
      geoJsonLayerRef.current.remove()
      geoJsonLayerRef.current = null
    }

    const featuresWithParcels = parcels
      .filter(p => p.polygon_geojson)
      .map(p => ({
        type: 'Feature' as const,
        geometry: p.polygon_geojson as any,
        properties: p,
      }))

    if (featuresWithParcels.length === 0) return

    try {
      const geoLayer = L.geoJSON(featuresWithParcels as any, {
        style: () => ({
          color: '#00ff00',
          weight: 3,
          fillColor: '#00ff00',
          fillOpacity: 0.2
        }),
        onEachFeature: (feature, layer) => {
          const parcel = feature.properties as ParcelSummary
          const safeCode = escapeHtml(parcel.parcel_code)
          const safeHousehold = escapeHtml(parcel.household?.name || 'N/A')
          const safeCrop = escapeHtml(parcel.crop_type || 'Chưa có')
          const safeArea = escapeHtml(parcel.area_ha != null ? `${parcel.area_ha} ha` : '—')
          const safeStatus = escapeHtml(parcel.status)
          const safeId = escapeHtml(parcel.id)

          const popupDiv = document.createElement('div')
          popupDiv.className = styles.popupContainer
          popupDiv.innerHTML = `
            <h3 class="${styles.popupTitle}">Thông tin thửa đất</h3>
            <p class="${styles.popupRow}"><strong>Mã vùng:</strong> ${safeCode}</p>
            <p class="${styles.popupRow}"><strong>Nông hộ:</strong> ${safeHousehold}</p>
            <p class="${styles.popupRow}"><strong>Cây trồng:</strong> ${safeCrop}</p>
            <p class="${styles.popupRow}"><strong>Diện tích:</strong> ${safeArea}</p>
            <p class="${styles.popupRow}"><strong>Trạng thái:</strong> ${safeStatus}</p>
            <div class="${styles.farmViewSection}">
              <h4 class="${styles.farmViewTitle}">Thực địa (Farm View)</h4>
              <div id="farm-photo-${safeId}">
                <p class="${styles.loadingText}">Đang tải ảnh thực địa...</p>
              </div>
            </div>
          `

          layer.bindPopup(popupDiv)

          layer.on('popupopen', async () => {
            const container = popupDiv.querySelector(`#farm-photo-${safeId}`)
            if (!container) return
            try {
              const res = await fetch(`/api/parcels/${parcel.id}/latest-photo`)
              if (res.ok) {
                const data = await res.json()
                if (data.photoUrl) {
                  const safeDateText = data.date
                    ? `<p class="${styles.imageDate}">Chụp ngày: ${escapeHtml(new Date(data.date).toLocaleDateString('vi-VN'))}</p>`
                    : ''
                  const photoWrapper = document.createElement('div')
                  const imgWrapper = document.createElement('div')
                  imgWrapper.className = styles.imageWrapper

                  const img = document.createElement('img')
                  img.src = data.photoUrl
                  img.alt = `Farm View ${parcel.parcel_code || ''}`
                  img.style.width = '100%'
                  img.style.height = '100%'
                  img.style.objectFit = 'cover'
                  img.style.borderRadius = '4px'

                  imgWrapper.appendChild(img)
                  photoWrapper.appendChild(imgWrapper)
                  if (safeDateText) {
                    const dateDiv = document.createElement('div')
                    dateDiv.innerHTML = safeDateText
                    photoWrapper.appendChild(dateDiv)
                  }

                  container.innerHTML = ''
                  container.appendChild(photoWrapper)
                } else {
                  container.innerHTML = `<div class="${styles.placeholder}"><p class="${styles.loadingText}">Chưa có ảnh nhật ký</p></div>`
                }
              }
            } catch {
              container.innerHTML = `<div class="${styles.placeholder}"><p class="${styles.loadingText}">Chưa có ảnh nhật ký</p></div>`
            }
          })
        }
      }).addTo(mapRef.current)

      geoJsonLayerRef.current = geoLayer
    } catch (e) {
      console.error('Error rendering ZoneMap polygons:', e)
    }
  }, [parcels])

  if (!isMounted) return <div style={{ height: '400px', backgroundColor: 'var(--card)' }} />

  return (
    <div style={mapStyle} className="relative overflow-hidden">
      <div ref={mapContainerRef} className="h-full w-full absolute inset-0 z-0" />
    </div>
  )
}
