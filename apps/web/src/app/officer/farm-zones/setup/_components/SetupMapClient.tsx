// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
// @ts-ignore: leaflet-geosearch thiếu type definitions chuẩn cho TypeScript
import { GeoSearchControl, EsriProvider } from 'leaflet-geosearch'
import 'leaflet-geosearch/dist/geosearch.css'
import area from '@turf/area'
import { polygon as turfPolygon } from '@turf/helpers'
import { toast } from 'sonner'

interface Props {
  onAreaCalculated: (areaSqm: number, geojson?: object, center?: { lat: number, lng: number }) => void
}

export default function SetupMapClient({ onAreaCalculated }: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  
  const onAreaCalculatedRef = useRef(onAreaCalculated)
  useEffect(() => {
    onAreaCalculatedRef.current = onAreaCalculated
  }, [onAreaCalculated])

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    // Fix Leaflet's default icon path issues in Next.js
    delete (L.Icon.Default.prototype as any)._getIconUrl
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    })

    const map = L.map(mapContainerRef.current, {
      center: [10.762622, 106.660172],
      zoom: 13,
      maxZoom: 24, // Cho phép zoom thật sâu
    })

    // Base Layers - Satellite ONLY
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      maxNativeZoom: 19, // Mức zoom tối đa mà vệ tinh Esri cung cấp ảnh thực
      maxZoom: 24 // Trình duyệt sẽ tự phóng to ảnh (digital zoom) để vẽ chi tiết
    }).addTo(map)

    // 1. Search Control (GeoSearch)
    const provider = new EsriProvider()
    const originalSearch = provider.search.bind(provider)
    provider.search = async (options: any) => {
      try {
        return await originalSearch(options)
      } catch (error) {
        console.error('GeoSearch Error:', error)
        toast.error('Không thể tìm kiếm địa chỉ do kết nối mạng bị gián đoạn hoặc máy chủ quá tải.')
        return []
      }
    }

    // @ts-ignore: Khởi tạo GeoSearchControl bị báo lỗi type do thiếu interface khai báo chuẩn
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

    // 2. Locate Control (Vị trí của tôi)
    // @ts-ignore: L.Control.extend không được support sẵn trong @types/leaflet
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
          map.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true })
        }
        return container
      }
    })
    const locateControl = new LocateControl()
    map.addControl(locateControl)

    let myLocationMarker: L.Marker | null = null
    const onLocationFound = (e: L.LocationEvent) => {
      if (myLocationMarker) {
        map.removeLayer(myLocationMarker)
      }
      myLocationMarker = L.marker(e.latlng).addTo(map)
        .bindPopup('Vị trí hiện tại của bạn').openPopup()
    }

    const onLocationError = (_e: L.ErrorEvent) => {
      toast.error('Không thể định vị. Vui lòng kiểm tra quyền vị trí trên trình duyệt.')
    }

    map.on('locationfound', onLocationFound)
    map.on('locationerror', onLocationError)

    // 3. Geoman Controls
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
    try {
      if (typeof (map.pm as any)?.setLang === 'function') {
        ;(map.pm as any).setLang('vi', {
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
      }
    } catch {
      // Fallback silently if locale definition cannot be applied
    }

    // @ts-ignore: leaflet-geoman chưa export event type chính xác
    map.on('pm:create', (e: any) => {
      const layer = e.layer as L.Polygon
      const geojson = layer.toGeoJSON()
      
      try {
        if (geojson.geometry.type === 'Polygon') {
          const sqm = area(turfPolygon(geojson.geometry.coordinates))
          onAreaCalculatedRef.current(Math.round(sqm), geojson, layer.getBounds().getCenter())
        }
      } catch {
        // Ignore invalid geometry error
      }
      
      // Listen to edit
      // @ts-ignore: leaflet-geoman chưa export event type chính xác
      layer.on('pm:edit', (editEvent: any) => {
        const editedLayer = editEvent.target as L.Polygon
        const editedGeojson = editedLayer.toGeoJSON()
        try {
          if (editedGeojson.geometry.type === 'Polygon') {
            const editedSqm = area(turfPolygon(editedGeojson.geometry.coordinates))
            onAreaCalculatedRef.current(Math.round(editedSqm), editedGeojson, editedLayer.getBounds().getCenter())
          }
        } catch {
          // Ignore invalid geometry error
        }
      })
    })

    map.on('pm:remove', () => {
      onAreaCalculatedRef.current(0)
    })

    mapRef.current = map
    const resizeTimer = setTimeout(() => map.invalidateSize(), 250)

    const handleResize = () => {
      map.invalidateSize()
    }
    window.addEventListener('resize', handleResize)

    return () => {
      clearTimeout(resizeTimer)
      window.removeEventListener('resize', handleResize)
      if (myLocationMarker) {
        map.removeLayer(myLocationMarker)
      }
      map.removeControl(searchControl)
      map.removeControl(locateControl)
      map.off('locationfound', onLocationFound)
      map.off('locationerror', onLocationError)
      map.pm.removeControls()
      map.off('pm:create')
      map.off('pm:remove')
      map.remove()
      mapRef.current = null
    }
  }, []) // Remove onAreaCalculated from dependencies to avoid re-init

  return (
    <div 
      ref={mapContainerRef} 
      style={{ height: '100%', width: '100%', borderRadius: 'var(--radius-lg)', zIndex: 1 }} 
    />
  )
}
