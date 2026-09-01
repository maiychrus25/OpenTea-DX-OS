// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

// @ts-ignore: Chờ cập nhật type Parcel chuẩn từ domain
export default function AutoBounds({ parcels }: { parcels: any[] }) {
  const map = useMap()

  useEffect(() => {
    if (!parcels || parcels.length === 0) return

    let hasValid = false
    const bounds = L.latLngBounds([])

    parcels.forEach((p) => {
      const geo = p.polygon_geojson
      if (geo && Array.isArray(geo.coordinates) && geo.coordinates.length > 0) {
        try {
          // @ts-ignore: turf/invariant không support nested FeatureCollection type chính xác
          const layer = L.geoJSON(geo as any)
          const layerBounds = layer.getBounds()
          if (layerBounds.isValid()) {
            bounds.extend(layerBounds)
            hasValid = true
          }
        } catch (e) {
          console.error("Invalid geojson for parcel", p.id, e)
        }
      }
    })

    if (hasValid && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 19 })
    }
  }, [parcels, map])

  return null
}
