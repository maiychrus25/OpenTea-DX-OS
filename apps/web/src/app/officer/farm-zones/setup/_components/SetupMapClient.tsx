// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect } from 'react'
import { MapContainer, TileLayer, useMap, LayersControl } from 'react-leaflet'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
// @ts-ignore
import { GeoSearchControl, OpenStreetMapProvider } from 'leaflet-geosearch'
import 'leaflet-geosearch/dist/geosearch.css'
import area from '@turf/area'
import { polygon as turfPolygon } from '@turf/helpers'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface Props {
  onAreaCalculated: (areaSqm: number) => void
}

function SearchAndLocateInit() {
  const map = useMap()

  useEffect(() => {
    // 1. Search Control
    const provider = new OpenStreetMapProvider({
      params: {
        'accept-language': 'vi',
        countrycodes: 'vn',
      }
    })
    
    // @ts-ignore
    const searchControl = new GeoSearchControl({
      provider,
      style: 'bar',
      showMarker: true,
      showPopup: false,
      autoClose: true,
      retainZoomLevel: false,
      animateZoom: true,
      keepResult: true,
      searchLabel: 'Nhập địa chỉ (VD: Xã Lộc An, Bảo Lâm)...'
    })
    map.addControl(searchControl)

    // 2. Locate Control (Custom Button for My Location)
    // @ts-ignore
    const LocateControl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: function () {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom')
        container.style.backgroundColor = 'white'
        container.style.width = '34px'
        container.style.height = '34px'
        container.style.cursor = 'pointer'
        container.style.backgroundImage = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpolygon points=\'3 11 22 2 13 21 11 13 3 11\'/%3E%3C/svg%3E")'
        container.style.backgroundSize = '16px'
        container.style.backgroundRepeat = 'no-repeat'
        container.style.backgroundPosition = 'center'
        container.title = 'Vị trí của tôi'
        
        container.onclick = (e) => {
          e.preventDefault()
          e.stopPropagation()
          map.locate({ setView: true, maxZoom: 16 })
        }
        return container
      }
    })
    const locateControl = new LocateControl()
    map.addControl(locateControl)

    return () => {
      map.removeControl(searchControl)
      map.removeControl(locateControl)
    }
  }, [map])

  return null
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
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Bản đồ đường phố (OSM)">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Bản đồ Vệ tinh (Esri)">
          <TileLayer
            attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />
        </LayersControl.BaseLayer>
      </LayersControl>
      
      <SearchAndLocateInit />
      <GeomanInit onAreaCalculated={onAreaCalculated} />
    </MapContainer>
  )
}
