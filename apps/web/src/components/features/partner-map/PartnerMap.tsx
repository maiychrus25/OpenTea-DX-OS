// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

"use client"

import React, { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPin, Search, Plus, Trash2, Edit2, List, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal/Modal'
import { Button } from '@/components/ui'
import { escapeHtml } from '@/lib/sanitize'
import styles from './partner-map.module.css'

type Partner = {
  id: string
  name: string
  partner_type: string
  contact_phone?: string | null
  lat: number
  lng: number
  address?: string | null
  primary_commodities?: string[]
}

const PARTNER_TYPE_MAP: Record<string, string> = {
  BUYER: 'Người mua',
  MIDDLEMAN: 'Thương lái',
  WAREHOUSE: 'Nhà kho'
}

export default function PartnerMap() {
  const [partners, setPartners] = useState<Partner[]>([])
  const [isLoadingList, setIsLoadingList] = useState(true)
  const [query, setQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [suggests, setSuggests] = useState<any[]>([])
  const [selected, setSelected] = useState<{ lat: number; lng: number } | null>(null)
  const [flyToLocation, setFlyToLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [form, setForm] = useState<{ name: string; partner_type: string; contact_phone: string; address: string }>({
    name: '',
    partner_type: 'BUYER',
    contact_phone: '',
    address: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Edit State
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null)
  const [editForm, setEditForm] = useState<{ name: string; partner_type: string; contact_phone: string; address: string }>({
    name: '',
    partner_type: 'BUYER',
    contact_phone: '',
    address: ''
  })
  const [isUpdating, setIsUpdating] = useState(false)

  // Delete State
  const [deletingPartner, setDeletingPartner] = useState<Partner | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const dropdownRef = useRef<HTMLDivElement>(null)

  // Leaflet icon fix for Next.js (webpack replaces _getIconUrl)
  useEffect(() => {
    import('leaflet').then(L => {
      // @ts-ignore — Leaflet webpack workaround (AD-18)
      delete L.Icon.Default.prototype._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })
    })
  }, [])

  // Load partners from API
  useEffect(() => {
    setIsLoadingList(true)
    fetch('/api/partners')
      .then(r => r.json())
      .then(j => {
        setPartners(j.data || [])
      })
      .catch(() => {
        toast.error('Không thể tải danh sách đối tác')
      })
      .finally(() => {
        setIsLoadingList(false)
      })
  }, [])

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setSuggests([])
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Debounced search with loading indicator
  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setSuggests([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    const t = setTimeout(() => {
      fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`)
        .then(r => r.json())
        .then(j => {
          setSuggests(j.data || j.results || [])
        })
        .catch(() => {
          setSuggests([])
        })
        .finally(() => {
          setIsSearching(false)
        })
    }, 400)

    return () => clearTimeout(t)
  }, [query])

  // Handle map click-to-pick
  const handleMapClick = useCallback((coords: { lat: number; lng: number }) => {
    setSelected(coords)
    setFlyToLocation(coords)
    toast.info(`Đã chấm tọa độ: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`)
  }, [])

  // Handle open edit
  const handleOpenEdit = (p: Partner) => {
    setEditingPartner(p)
    setEditForm({
      name: p.name,
      partner_type: p.partner_type,
      contact_phone: p.contact_phone || '',
      address: p.address || ''
    })
  }

  // Handle update partner
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingPartner) return
    setIsUpdating(true)
    try {
      const res = await fetch(`/api/partners/${editingPartner.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      })
      const j = await res.json()
      if (res.ok && j.data) {
        setPartners(prev => prev.map(item => (item.id === editingPartner.id ? j.data : item)))
        toast.success(`Cập nhật thông tin đối tác ${j.data.name} thành công!`)
        setEditingPartner(null)
      } else {
        toast.error(j.error?.message || 'Có lỗi xảy ra khi cập nhật đối tác')
      }
    } catch {
      toast.error('Lỗi kết nối khi cập nhật đối tác')
    } finally {
      setIsUpdating(false)
    }
  }

  // Handle delete partner
  const handleConfirmDelete = async () => {
    if (!deletingPartner) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/partners/${deletingPartner.id}`, { method: 'DELETE' })
      if (res.ok) {
        setPartners(prev => prev.filter(p => p.id !== deletingPartner.id))
        toast.success(`Đã xóa đối tác ${deletingPartner.name} thành công!`)
        setDeletingPartner(null)
      } else {
        const j = await res.json().catch(() => ({}))
        toast.error(j.error?.message || 'Không thể xóa đối tác này')
      }
    } catch {
      toast.error('Lỗi kết nối khi xóa đối tác')
    } finally {
      setIsDeleting(false)
    }
  }

  // Handle create partner
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      toast.error('Vui lòng nhập tên đối tác')
      return
    }

    setIsSubmitting(true)
    try {
      const payload: any = {
        name: form.name.trim(),
        partner_type: form.partner_type,
        contact_phone: form.contact_phone.trim() || undefined,
        address: form.address.trim() || undefined
      }

      if (selected) {
        payload.lat = selected.lat
        payload.lng = selected.lng
      }

      const res = await fetch('/api/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const j = await res.json()
      if (res.ok && j.data) {
        setPartners(prev => [j.data, ...prev])
        setForm({ name: '', partner_type: 'BUYER', contact_phone: '', address: '' })
        setSelected(null)
        setFlyToLocation({ lat: j.data.lat, lng: j.data.lng })
        setQuery('')
        toast.success(`Đã thêm đối tác ${j.data.name} thành công!`)
      } else {
        toast.error(j.error?.message || 'Có lỗi xảy ra khi lưu đối tác')
      }
    } catch {
      toast.error('Lỗi kết nối máy chủ khi tạo đối tác')
    } finally {
      setIsSubmitting(false)
    }
  }

  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersLayerRef = useRef<L.LayerGroup | null>(null)
  const selectedMarkerRef = useRef<L.Marker | null>(null)

  // Initialize pure Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    delete (L.Icon.Default.prototype as any)._getIconUrl
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    })

    const map = L.map(mapContainerRef.current, {
      center: [10.0452, 105.7469],
      zoom: 8,
      minZoom: 6,
      maxBounds: [
        [8.0, 102.0],
        [23.5, 109.5]
      ],
      maxBoundsViscosity: 1.0,
    })

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    }).addTo(map)

    const markersLayer = L.layerGroup().addTo(map)
    markersLayerRef.current = markersLayer

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (e && e.latlng) {
        handleMapClick({ lat: e.latlng.lat, lng: e.latlng.lng })
      }
    })

    mapRef.current = map
    const resizeTimer = setTimeout(() => {
      map.invalidateSize()
    }, 250)

    const handleWindowResize = () => {
      map.invalidateSize()
    }
    window.addEventListener('resize', handleWindowResize)

    return () => {
      clearTimeout(resizeTimer)
      window.removeEventListener('resize', handleWindowResize)
      map.remove()
      mapRef.current = null
      markersLayerRef.current = null
      selectedMarkerRef.current = null
    }
  }, [handleMapClick])

  // Sync partners markers
  useEffect(() => {
    if (!mapRef.current || !markersLayerRef.current) return
    markersLayerRef.current.clearLayers()

    partners.forEach(p => {
      const marker = L.marker([p.lat, p.lng])
      
      const safeName = escapeHtml(p.name)
      const safeType = escapeHtml(PARTNER_TYPE_MAP[p.partner_type] || p.partner_type)
      const safePhone = escapeHtml(p.contact_phone)
      const safeAddress = escapeHtml(p.address)

      const popupDiv = document.createElement('div')
      popupDiv.className = styles.popupContent
      popupDiv.innerHTML = `
        <div class="${styles.popupTitle}">${safeName}</div>
        <span class="${styles.popupBadge}">${safeType}</span>
        ${safePhone ? `<div class="${styles.popupInfo}">SĐT: <strong>${safePhone}</strong></div>` : ''}
        ${safeAddress ? `<div class="${styles.popupInfo}">Đ/c: ${safeAddress}</div>` : ''}
        <div class="${styles.popupActions}">
          <button type="button" class="${styles.popupBtnEdit}" id="edit-partner-${p.id}" title="Chỉnh sửa thông tin">
            Sửa
          </button>
          <button type="button" class="${styles.popupBtnDelete}" id="del-partner-${p.id}" title="Xóa đối tác">
            Xóa
          </button>
        </div>
      `

      popupDiv.querySelector(`#edit-partner-${p.id}`)?.addEventListener('click', (ev) => {
        ev.stopPropagation()
        handleOpenEdit(p)
      })

      popupDiv.querySelector(`#del-partner-${p.id}`)?.addEventListener('click', (ev) => {
        ev.stopPropagation()
        setDeletingPartner(p)
      })

      marker.bindPopup(popupDiv)
      markersLayerRef.current?.addLayer(marker)
    })
  }, [partners])

  // Sync selected coordinate marker
  useEffect(() => {
    if (!mapRef.current) return
    if (selected) {
      if (!selectedMarkerRef.current) {
        const marker = L.marker([selected.lat, selected.lng], { opacity: 0.9 })
        const popupDiv = document.createElement('div')
        popupDiv.className = 'text-xs p-1 font-sans'
        popupDiv.innerHTML = `
          <strong class="text-[var(--color-primary)] block mb-1">Vị trí đang chấm ghim</strong>
          <div>Tọa độ: ${selected.lat.toFixed(4)}, ${selected.lng.toFixed(4)}</div>
        `
        marker.bindPopup(popupDiv)
        marker.addTo(mapRef.current)
        selectedMarkerRef.current = marker
      } else {
        selectedMarkerRef.current.setLatLng([selected.lat, selected.lng])
      }
    } else {
      if (selectedMarkerRef.current) {
        selectedMarkerRef.current.remove()
        selectedMarkerRef.current = null
      }
    }
  }, [selected])

  // Sync flyTo location
  useEffect(() => {
    if (flyToLocation && mapRef.current) {
      mapRef.current.flyTo([flyToLocation.lat, flyToLocation.lng], 15, { duration: 1.5 })
    }
  }, [flyToLocation])

  // Can submit if name is present AND (coordinates are selected OR address text is provided)
  const canSubmit = form.name.trim().length > 0 && (selected !== null || form.address.trim().length > 0)

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      
      {/* Left Sidebar: Form & List */}
      <div className="w-full lg:w-[400px] flex flex-col gap-6 shrink-0">
        
        {/* Add Partner Form */}
        <div className="bg-[var(--color-surface-sunken)] rounded-xl border border-[var(--color-surface-border)] overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-[var(--color-surface-border)] bg-[var(--color-surface-base)]">
            <h2 className="font-semibold text-[var(--color-ink-primary)]">Thêm Đối Tác Mới</h2>
            <p className="text-xs text-[var(--color-ink-secondary)] mt-0.5">Tìm kiếm địa điểm hoặc nhấp trực tiếp lên bản đồ</p>
          </div>
          <div className="p-5">
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              
              {/* Location Search Field */}
              <div className="relative" ref={dropdownRef}>
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--color-ink-tertiary)]" aria-hidden="true" />
                <input 
                  type="text"
                  placeholder="Tìm kiếm vị trí trên bản đồ..." 
                  value={query} 
                  onChange={e => setQuery(e.target.value)} 
                  className="w-full pl-9 pr-9 py-2 bg-[var(--color-surface-base)] border border-[var(--color-surface-border)] rounded-lg text-sm text-[var(--color-ink-primary)] placeholder-[var(--color-ink-tertiary)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-colors"
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-[var(--color-primary)]" aria-hidden="true" />
                )}
                {!isSearching && query && (
                  <button
                    type="button"
                    onClick={() => { setQuery(''); setSuggests([]); }}
                    className="absolute right-3 top-2.5 text-[var(--color-ink-tertiary)] hover:text-[var(--color-ink-primary)]"
                    aria-label="Xóa từ khóa tìm kiếm"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                )}
                
                {/* Search Suggestion Dropdown with Opaque CSS */}
                {suggests.length > 0 && (
                  <div className={styles.suggestDropdown}>
                    {suggests.map((s, i) => (
                      <button 
                        type="button"
                        key={i} 
                        className={styles.suggestItem}
                        onClick={() => {
                          const lat = parseFloat(s.lat)
                          const lng = parseFloat(s.lon || s.lng)
                          setSelected({ lat, lng })
                          setFlyToLocation({ lat, lng })
                          setForm({ ...form, address: s.display_name })
                          setSuggests([])
                          setQuery('')
                          toast.success('Đã chọn vị trí từ gợi ý!')
                        }}
                      >
                        <div className={styles.suggestContent}>
                          <MapPin className={styles.suggestIcon} aria-hidden="true" />
                          <span className={styles.suggestText}>{s.display_name}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected Coordinates Badge */}
              {selected ? (
                <div className="text-xs text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-3 py-2 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>Tọa độ: {selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="text-[var(--color-ink-tertiary)] hover:text-red-600 ml-2"
                    title="Hủy chọn tọa độ"
                    aria-label="Hủy chọn tọa độ"
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <div className="text-xs text-[var(--color-ink-tertiary)] bg-[var(--color-surface-base)] px-3 py-2 rounded-lg border border-dashed border-[var(--color-surface-border)] flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Mẹo: Nhấp chuột vào điểm bất kỳ trên bản đồ để ghim</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-medium text-[var(--color-ink-secondary)]">
                    Tên đối tác <span className="text-red-500">*</span>
                  </label>
                  <input 
                    required 
                    placeholder="Nhập tên đối tác" 
                    value={form.name} 
                    onChange={e => setForm({ ...form, name: e.target.value })} 
                    className="w-full px-3 py-2 bg-[var(--color-surface-base)] border border-[var(--color-surface-border)] rounded-lg text-sm text-[var(--color-ink-primary)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-colors" 
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--color-ink-secondary)]">Loại đối tác</label>
                  <select 
                    value={form.partner_type} 
                    onChange={e => setForm({ ...form, partner_type: e.target.value })} 
                    className="w-full px-3 py-2 bg-[var(--color-surface-base)] border border-[var(--color-surface-border)] rounded-lg text-sm text-[var(--color-ink-primary)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-colors"
                  >
                    <option value="BUYER">Người mua</option>
                    <option value="MIDDLEMAN">Thương lái</option>
                    <option value="WAREHOUSE">Nhà kho</option>
                  </select>
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--color-ink-secondary)]">Số điện thoại</label>
                  <input 
                    placeholder="VD: 0987654321" 
                    value={form.contact_phone} 
                    onChange={e => setForm({ ...form, contact_phone: e.target.value })} 
                    className="w-full px-3 py-2 bg-[var(--color-surface-base)] border border-[var(--color-surface-border)] rounded-lg text-sm text-[var(--color-ink-primary)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-colors" 
                  />
                </div>

                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-medium text-[var(--color-ink-secondary)]">Địa chỉ chi tiết</label>
                  <input 
                    placeholder="Nhập địa chỉ hoặc chọn từ gợi ý..." 
                    value={form.address} 
                    onChange={e => setForm({ ...form, address: e.target.value })} 
                    className="w-full px-3 py-2 bg-[var(--color-surface-base)] border border-[var(--color-surface-border)] rounded-lg text-sm text-[var(--color-ink-primary)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-colors" 
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={!canSubmit || isSubmitting} 
                className="mt-2 w-full flex items-center justify-center gap-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Đang lưu đối tác...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Thêm Đối Tác
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Partners List */}
        <div className="bg-[var(--color-surface-sunken)] rounded-xl border border-[var(--color-surface-border)] overflow-hidden shadow-sm flex flex-col h-[400px]">
          <div className="px-5 py-4 border-b border-[var(--color-surface-border)] bg-[var(--color-surface-base)] flex items-center justify-between">
            <h2 className="font-semibold text-[var(--color-ink-primary)]">Danh Sách Đối Tác</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium bg-[var(--color-surface-sunken)] px-2.5 py-1 rounded-full text-[var(--color-ink-secondary)]">
                {partners.length} đối tác
              </span>
              <Link 
                href="/manager/partners" 
                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-primary)] hover:underline bg-[var(--color-primary)]/10 px-2.5 py-1 rounded-full transition-colors"
                title="Chuyển sang xem dạng bảng danh bạ"
              >
                <List size={13} aria-hidden="true" />
                Xem dạng bảng
              </Link>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {isLoadingList ? (
              <div className="text-center py-12 text-[var(--color-ink-tertiary)] flex flex-col items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--color-primary)]" aria-hidden="true" />
                <p className="text-xs">Đang tải danh sách đối tác...</p>
              </div>
            ) : partners.length === 0 ? (
              <div className="text-center py-12 text-[var(--color-ink-tertiary)] flex flex-col items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-[var(--color-surface-base)] flex items-center justify-center">
                  <MapPin className="h-5 w-5" aria-hidden="true" />
                </div>
                <p className="text-sm">Chưa có đối tác nào</p>
              </div>
            ) : (
              partners.map(p => (
                <div 
                  key={p.id} 
                  onClick={() => setFlyToLocation({ lat: p.lat, lng: p.lng })} 
                  className="cursor-pointer bg-[var(--color-surface-base)] p-4 rounded-lg border border-[var(--color-surface-border)] hover:border-[var(--color-primary)] hover:shadow-md transition-all group"
                >
                  <div className="flex justify-between items-start gap-4 mb-2">
                    <div>
                      <h3 className="font-medium text-[var(--color-ink-primary)] line-clamp-1 group-hover:text-[var(--color-primary)] transition-colors" title={p.name}>
                        {p.name}
                      </h3>
                      <span className="inline-block mt-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] capitalize">
                        {PARTNER_TYPE_MAP[p.partner_type] || p.partner_type}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        type="button"
                        onClick={e => { e.stopPropagation(); handleOpenEdit(p); }} 
                        className="p-1.5 text-[var(--color-ink-tertiary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 rounded-md transition-colors" 
                        title="Chỉnh sửa thông tin"
                        aria-label="Chỉnh sửa đối tác"
                      >
                        <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button 
                        type="button"
                        onClick={e => { e.stopPropagation(); setDeletingPartner(p); }} 
                        className="p-1.5 text-[var(--color-ink-tertiary)] hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" 
                        title="Xóa đối tác"
                        aria-label="Xóa đối tác"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-1.5 text-xs text-[var(--color-ink-secondary)]">
                    {p.contact_phone && (
                      <div className="flex items-center gap-2">
                        <span className="font-medium min-w-[32px]">SĐT:</span>
                        <span>{p.contact_phone}</span>
                      </div>
                    )}
                    {p.address && (
                      <div className="flex items-start gap-2">
                        <span className="font-medium min-w-[32px]">Đ/c:</span>
                        <span className="line-clamp-2" title={p.address}>{p.address}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Right Content: Map */}
      <div className="flex-1 bg-[var(--color-surface-sunken)] rounded-xl border border-[var(--color-surface-border)] overflow-hidden shadow-sm h-[800px] lg:h-auto lg:min-h-[600px] relative">
        <div ref={mapContainerRef} className="h-full w-full absolute inset-0 z-0" />
      </div>

      {/* Edit Partner Modal */}
      <Modal
        isOpen={!!editingPartner}
        onClose={() => setEditingPartner(null)}
        title="Chỉnh sửa thông tin đối tác"
      >
        <form onSubmit={handleUpdate} className="p-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--color-ink-secondary)]">Tên đối tác</label>
            <input
              required
              value={editForm.name}
              onChange={e => setEditForm({ ...editForm, name: e.target.value })}
              className="w-full px-3 py-2 bg-[var(--color-surface-base)] border border-[var(--color-surface-border)] rounded-lg text-sm text-[var(--color-ink-primary)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-colors"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--color-ink-secondary)]">Loại đối tác</label>
              <select
                value={editForm.partner_type}
                onChange={e => setEditForm({ ...editForm, partner_type: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--color-surface-base)] border border-[var(--color-surface-border)] rounded-lg text-sm text-[var(--color-ink-primary)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-colors"
              >
                <option value="BUYER">Người mua</option>
                <option value="MIDDLEMAN">Thương lái</option>
                <option value="WAREHOUSE">Nhà kho</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--color-ink-secondary)]">Số điện thoại</label>
              <input
                value={editForm.contact_phone}
                onChange={e => setEditForm({ ...editForm, contact_phone: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--color-surface-base)] border border-[var(--color-surface-border)] rounded-lg text-sm text-[var(--color-ink-primary)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-colors"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--color-ink-secondary)]">Địa chỉ</label>
            <input
              value={editForm.address}
              onChange={e => setEditForm({ ...editForm, address: e.target.value })}
              className="w-full px-3 py-2 bg-[var(--color-surface-base)] border border-[var(--color-surface-border)] rounded-lg text-sm text-[var(--color-ink-primary)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-colors"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditingPartner(null)} disabled={isUpdating}>
              Hủy
            </Button>
            <Button type="submit" variant="primary" disabled={isUpdating}>
              {isUpdating ? 'Đang lưu...' : 'Lưu thay đổi'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deletingPartner}
        onClose={() => setDeletingPartner(null)}
        title="Xác nhận xóa đối tác"
      >
        <div className="p-4 space-y-4">
          <p className="text-sm text-[var(--color-ink-secondary)]">
            Bạn có chắc chắn muốn xóa đối tác <strong>{deletingPartner?.name}</strong> khỏi hệ thống? Thao tác này không thể hoàn tác.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setDeletingPartner(null)} disabled={isDeleting}>
              Hủy
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? 'Đang xóa...' : 'Xác nhận xóa'}
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  )
}
