// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import area from '@turf/area'
import { polygon as turfPolygon } from '@turf/helpers'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface Props {
  onAreaCalculated: (areaSqm: number) => void
}

function GeomanInit({ onAreaCalculated }: Props) {
  const map = useMap()
  
  useEffect(() => {
    // Only allow drawing polygons
    map.pm.addControls({
      position: 'topleft',
      drawMarker: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawRectangle: false,
      drawCircle: false,
      drawText: false,
      editControls: true,
      drawPolygon: true,
      cutPolygon: false,
      removalMode: true,
    })

    // Set Vietnamese language for Geoman
    map.pm.setLang('vi', {
      tooltips: {
        placeMarker: 'Nhấp để đặt điểm',
        firstVertex: 'Nhấp để đặt điểm bắt đầu',
        continueLine: 'Nhấp để tiếp tục vẽ',
        finishLine: 'Nhấp bất kỳ điểm nào hiện tại để hoàn thành',
        finishPoly: 'Nhấp điểm đầu tiên để hoàn thành',
        finishRect: 'Nhấp để hoàn thành',
        startCircle: 'Nhấp để vẽ hình tròn',
        finishCircle: 'Nhấp để hoàn thành',
        placeCircleMarker: 'Nhấp để đặt điểm',
      },
      actions: {
        finish: 'Hoàn thành',
        cancel: 'Hủy',
        removeLastVertex: 'Xóa điểm cuối',
      },
      buttonOptions: {
        drawPolygon: 'Vẽ vùng trồng (Đa giác)',
        editMode: 'Sửa vùng trồng',
        removalMode: 'Xóa vùng trồng',
      },
    }, 'en')

    map.on('pm:create', (e: any) => {
      const layer = e.layer as L.Polygon
      const geojson = layer.toGeoJSON()
      
      if (geojson.geometry.type === 'Polygon') {
        const sqm = area(turfPolygon(geojson.geometry.coordinates))
        onAreaCalculated(Math.round(sqm))
      }
      
      // Listen to edit
      layer.on('pm:edit', (editEvent: any) => {
        const editedGeojson = (editEvent.target as L.Polygon).toGeoJSON()
        if (editedGeojson.geometry.type === 'Polygon') {
          const editedSqm = area(turfPolygon(editedGeojson.geometry.coordinates))
          onAreaCalculated(Math.round(editedSqm))
        }
      })
    })

    map.on('pm:remove', () => {
      onAreaCalculated(0)
    })

    return () => {
      map.pm.removeControls()
      map.off('pm:create')
      map.off('pm:remove')
    }
  }, [map, onAreaCalculated])

  return null
}

export default function SetupMapClient({ onAreaCalculated }: Props) {
  return (
    <MapContainer 
      center={[10.762622, 106.660172]} 
      zoom={13} 
      style={{ height: '100%', width: '100%', borderRadius: 'var(--radius-lg)', zIndex: 1 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <GeomanInit onAreaCalculated={onAreaCalculated} />
    </MapContainer>
  )
}
