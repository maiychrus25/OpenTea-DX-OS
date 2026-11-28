// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ParcelSummary } from '@/domain/farm/ports/ParcelPort'
import { escapeHtml } from '@/lib/sanitize'
import styles from './ZoneMap.module.css'
import { DEFAULT_MAP_VIEW, PARCEL_STATUS_CONFIG, parcelStatusLabel } from '@/lib/map-config'
import { addMapBaseLayers } from './map-layers'

interface ZoneMapProps {
  parcels: ParcelSummary[]
  /** A parcel to move the map to. */
  focusId?: string | null
}

// Khóa vùng kéo bản đồ (Giới hạn trong lãnh thổ đất liền/gần bờ Việt Nam)
const VIETNAM_BOUNDS: L.LatLngBoundsLiteral = [
  [8.0, 102.0], // Tây Nam
  [23.5, 109.5] // Đông Bắc
]

export default function ZoneMap({ parcels, focusId }: ZoneMapProps) {
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

    const map = L.map(mapContainerRef.current, {
      ...DEFAULT_MAP_VIEW,
      minZoom: 6,
      maxBounds: VIETNAM_BOUNDS,
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
  }, [isMounted])

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

    if (featuresWithParcels.length === 0) {
      // Không có ranh giới: về tâm các thửa nếu có toạ độ
      const points = parcels
        .filter(p => p.centroid_lat && p.centroid_lng)
        .map(p => [p.centroid_lat!, p.centroid_lng!] as [number, number])
      if (points.length > 0) mapRef.current.fitBounds(L.latLngBounds(points), { maxZoom: 15 })
      return
    }

    try {
      const geoLayer = L.geoJSON(featuresWithParcels as any, {
        style: (feature) => {
          const config = PARCEL_STATUS_CONFIG[(feature?.properties as ParcelSummary | undefined)?.status ?? '']
          return {
            color: config?.color ?? 'var(--color-primary)',
            fillColor: config?.fillColor ?? 'var(--color-primary)',
            weight: 3,
            fillOpacity: 0.25,
          }
        },
        onEachFeature: (feature, layer) => {
          const parcel = feature.properties as ParcelSummary
          const safeCode = escapeHtml(parcel.parcel_code)
          const safeHousehold = escapeHtml(parcel.household?.name || 'N/A')
          const safeCrop = escapeHtml(parcel.crop_type || 'Chưa có')
          const safeArea = escapeHtml(parcel.area_ha != null ? `${parcel.area_ha} ha` : '—')
          const safeStatus = escapeHtml(parcelStatusLabel(parcel.status))
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
      const bounds = geoLayer.getBounds()
      if (bounds.isValid()) mapRef.current.fitBounds(bounds, { maxZoom: 17, padding: [24, 24] })
    } catch (e) {
      console.error('Error rendering ZoneMap polygons:', e)
    }
  }, [parcels, isMounted])

  // Declared after the layers effect so that it wins over the fit to all parcels.
  useEffect(() => {
    const parcel = parcels.find(p => p.id === focusId)
    if (!parcel || !mapRef.current) return
    if (parcel.polygon_geojson) {
      const bounds = L.geoJSON(parcel.polygon_geojson as any).getBounds()
      if (bounds.isValid()) mapRef.current.fitBounds(bounds, { maxZoom: 18, padding: [24, 24] })
    } else if (parcel.centroid_lat && parcel.centroid_lng) {
      mapRef.current.setView([parcel.centroid_lat, parcel.centroid_lng], 17)
    }
  }, [focusId, parcels, isMounted])

  if (!isMounted) return <div className={styles.mapFrame} />

  const hasBoundaries = parcels.some(p => p.polygon_geojson)

  return (
    <div className={styles.mapFrame}>
      <div ref={mapContainerRef} className={styles.mapCanvas} />
      {!hasBoundaries && (
        <div className={styles.emptyBanner}>
          <p>Chưa có thửa nào được vẽ ranh giới.</p>
        </div>
      )}
      <div className={styles.legend}>
        {Object.entries(PARCEL_STATUS_CONFIG).map(([status, config]) => (
          <span key={status}>
            <i className={styles.swatch} style={{ background: config.fillColor }} aria-hidden="true" />
            {config.label}
          </span>
        ))}
      </div>
    </div>
  )
}
