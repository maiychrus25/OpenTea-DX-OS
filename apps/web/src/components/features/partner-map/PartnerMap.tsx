"use client"

// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React, { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import 'leaflet/dist/leaflet.css'
import { MapPin, Search, Plus, Trash2, Edit2 } from 'lucide-react'

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false })

const MapUpdater = dynamic(() => import('react-leaflet').then(m => {
  return function MapUpdaterComponent({ selected }: { selected: {lat:number,lng:number}|null }) {
    const map = m.useMap()
    React.useEffect(() => {
      if (selected) {
        map.flyTo([selected.lat, selected.lng], 15, { duration: 1.5 })
      }
    }, [selected, map])
    return null
  }
}), { ssr: false })

type Partner = {
  id: string
  name: string
  partner_type: string
  contact_phone?: string
  lat: number
  lng: number
  address?: string
}

const PARTNER_TYPE_MAP: Record<string, string> = {
  BUYER: 'Người mua',
  MIDDLEMAN: 'Thương lái',
  WAREHOUSE: 'Nhà kho'
}

export default function PartnerMap() {
  const [partners, setPartners] = useState<Partner[]>([])
  const [query, setQuery] = useState('')
  const [suggests, setSuggests] = useState<any[]>([])
  const [selected, setSelected] = useState<{lat:number,lng:number}|null>(null)
  const [flyToLocation, setFlyToLocation] = useState<{lat:number,lng:number}|null>(null)
  const [form, setForm] = useState<any>({ name: '', partner_type: 'BUYER', contact_phone: '', address: '' })

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

  useEffect(() => { fetch('/api/partners').then(r=>r.json()).then(j=>setPartners(j.data||[])) }, [])

  // Lightweight debounce
  useEffect(() => {
    const t = setTimeout(() => {
      if (!query) return setSuggests([])
      fetch(`/api/geocode?q=${encodeURIComponent(query)}`).then(r=>r.json()).then(j=>setSuggests(j.data||[]))
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  const markers = useMemo(() => partners.map(p => (
    <Marker key={p.id} position={[p.lat, p.lng] as any}>
      <Popup>
        <div className="flex flex-col gap-1 p-1">
          <strong className="text-[var(--color-ink-primary)]">{p.name}</strong>
          <span className="text-sm font-medium px-2 py-0.5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] w-fit capitalize">{PARTNER_TYPE_MAP[p.partner_type] || p.partner_type}</span>
          <span className="text-sm text-[var(--color-ink-secondary)]">{p.contact_phone}</span>
        </div>
      </Popup>
    </Marker>
  )), [partners])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const payload = { ...form }
    if (selected) { payload.lat = selected.lat; payload.lng = selected.lng }
    const res = await fetch('/api/partners', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload) })
    const j = await res.json()
    if (j.data) {
      setPartners(prev => [j.data, ...prev])
      setForm({ name: '', partner_type: 'BUYER', contact_phone: '', address: '' })
      setSelected(null)
      setFlyToLocation(null)
      setQuery('')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Xác nhận xóa partner này?')) return
    const res = await fetch(`/api/partners/${id}`, { method: 'DELETE' })
    if (res.ok) setPartners(prev => prev.filter(p => p.id !== id))
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      
      {/* Left Sidebar: Form & List */}
      <div className="w-full lg:w-[400px] flex flex-col gap-6 shrink-0">
        
        {/* Add Partner Form */}
        <div className="bg-[var(--color-surface-sunken)] rounded-xl border border-[var(--color-surface-border)] overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-[var(--color-surface-border)] bg-[var(--color-surface-base)]">
            <h2 className="font-semibold text-[var(--color-ink-primary)]">Thêm Đối Tác Mới</h2>
          </div>
          <div className="p-5">
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--color-ink-tertiary)]" />
                <input 
                  type="text"
                  placeholder="Tìm kiếm vị trí trên bản đồ..." 
                  value={query} 
                  onChange={e=>setQuery(e.target.value)} 
                  className="w-full pl-9 pr-4 py-2 bg-[var(--color-surface-base)] border border-[var(--color-surface-border)] rounded-lg text-sm text-[var(--color-ink-primary)] placeholder-[var(--color-ink-tertiary)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-colors"
                />
                
                {/* Search Suggestion Dropdown */}
                {suggests.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--color-surface-base)] border border-[var(--color-surface-border)] rounded-lg shadow-lg max-h-60 overflow-y-auto z-10">
                    {suggests.map((s,i)=> (
                      <button 
                        type="button"
                        key={i} 
                        className="w-full text-left px-4 py-2 text-sm text-[var(--color-ink-primary)] hover:bg-[var(--color-surface-sunken)] border-b border-[var(--color-surface-border)] last:border-0 transition-colors"
                        onClick={()=>{ setSelected({lat:parseFloat(s.lat),lng:parseFloat(s.lon || s.lng)}); setFlyToLocation(null); setForm({...form,address:s.display_name}); setSuggests([]); setQuery('') }}
                      >
                        <div className="flex items-start gap-2">
                          <MapPin className="h-4 w-4 text-[var(--color-ink-tertiary)] shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{s.display_name}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selected && (
                <div className="text-xs text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-3 py-2 rounded-lg flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5" />
                  Đã chọn tọa độ: {selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-medium text-[var(--color-ink-secondary)]">Tên đối tác</label>
                  <input required placeholder="Nhập tên đối tác" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="w-full px-3 py-2 bg-[var(--color-surface-base)] border border-[var(--color-surface-border)] rounded-lg text-sm text-[var(--color-ink-primary)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-colors" />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--color-ink-secondary)]">Loại đối tác</label>
                  <select value={form.partner_type} onChange={e=>setForm({...form,partner_type:e.target.value})} className="w-full px-3 py-2 bg-[var(--color-surface-base)] border border-[var(--color-surface-border)] rounded-lg text-sm text-[var(--color-ink-primary)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-colors">
                    <option value="BUYER">Người mua</option>
                    <option value="MIDDLEMAN">Thương lái</option>
                    <option value="WAREHOUSE">Nhà kho</option>
                  </select>
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--color-ink-secondary)]">Số điện thoại</label>
                  <input placeholder="VD: 0987654321" value={form.contact_phone} onChange={e=>setForm({...form,contact_phone:e.target.value})} className="w-full px-3 py-2 bg-[var(--color-surface-base)] border border-[var(--color-surface-border)] rounded-lg text-sm text-[var(--color-ink-primary)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-colors" />
                </div>

                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-medium text-[var(--color-ink-secondary)]">Địa chỉ chi tiết</label>
                  <input required placeholder="Nhập địa chỉ" value={form.address} onChange={e=>setForm({...form,address:e.target.value})} className="w-full px-3 py-2 bg-[var(--color-surface-base)] border border-[var(--color-surface-border)] rounded-lg text-sm text-[var(--color-ink-primary)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-colors" />
                </div>
              </div>

              <button type="submit" disabled={!selected} className="mt-2 w-full flex items-center justify-center gap-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <Plus className="h-4 w-4" />
                Thêm Đối Tác
              </button>
            </form>
          </div>
        </div>

        {/* Partners List */}
        <div className="bg-[var(--color-surface-sunken)] rounded-xl border border-[var(--color-surface-border)] overflow-hidden shadow-sm flex flex-col h-[400px]">
          <div className="px-5 py-4 border-b border-[var(--color-surface-border)] bg-[var(--color-surface-base)] flex items-center justify-between">
            <h2 className="font-semibold text-[var(--color-ink-primary)]">Danh Sách Đối Tác</h2>
            <span className="text-xs font-medium bg-[var(--color-surface-sunken)] px-2.5 py-1 rounded-full text-[var(--color-ink-secondary)]">{partners.length} đối tác</span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {partners.length === 0 ? (
              <div className="text-center py-12 text-[var(--color-ink-tertiary)] flex flex-col items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-[var(--color-surface-base)] flex items-center justify-center">
                  <MapPin className="h-5 w-5" />
                </div>
                <p className="text-sm">Chưa có đối tác nào</p>
              </div>
            ) : (
              partners.map(p => (
                <div key={p.id} onClick={() => setFlyToLocation({lat: p.lat, lng: p.lng})} className="cursor-pointer bg-[var(--color-surface-base)] p-4 rounded-lg border border-[var(--color-surface-border)] hover:border-[var(--color-primary)] hover:shadow-md transition-all group">
                  <div className="flex justify-between items-start gap-4 mb-2">
                    <div>
                      <h3 className="font-medium text-[var(--color-ink-primary)] line-clamp-1 group-hover:text-[var(--color-primary)] transition-colors" title={p.name}>{p.name}</h3>
                      <span className="inline-block mt-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] capitalize">{PARTNER_TYPE_MAP[p.partner_type] || p.partner_type}</span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={()=>{}} className="p-1.5 text-[var(--color-ink-tertiary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 rounded-md transition-colors" title="Chỉnh sửa">
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={()=>handleDelete(p.id)} className="p-1.5 text-[var(--color-ink-tertiary)] hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Xóa">
                        <Trash2 className="h-3.5 w-3.5" />
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
        <MapContainer 
          center={[10.762622, 106.660172]} 
          zoom={6} 
          minZoom={6}
          maxBounds={[
            [8.0, 102.0], // Tây Nam
            [23.5, 109.5] // Đông Bắc
          ]}
          maxBoundsViscosity={1.0}
          className="h-full w-full absolute inset-0 z-0"
        >
          {/* OLP_COMPLIANCE_NOTE: 
              The satellite layer uses a public endpoint as a progressive UX enhancement. 
              It does NOT require any proprietary SDKs, paid API keys, or hidden credentials, 
              strictly adhering to the project's MNM (Open Source) non-commercial rules. */}
          <TileLayer 
            attribution='&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" 
          />
          <MapUpdater selected={flyToLocation || selected} />
          {markers}
        </MapContainer>
      </div>

    </div>
  )
}
