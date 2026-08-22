"use client"

import React, { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import styles from './PartnerMap.module.css'

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false })

type Partner = {
  id: string
  name: string
  partner_type: string
  contact_phone?: string
  lat: number
  lng: number
  address?: string
}

export default function PartnerMap() {
  const [partners, setPartners] = useState<Partner[]>([])
  const [query, setQuery] = useState('')
  const [suggests, setSuggests] = useState<any[]>([])
  const [selected, setSelected] = useState<{lat:number,lng:number}|null>(null)
  const [form, setForm] = useState<any>({ name: '', partner_type: 'buyer', contact_phone: '', address: '' })

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
        <div>
          <strong>{p.name}</strong>
          <div>{p.partner_type}</div>
          <div>{p.contact_phone}</div>
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
    if (j.data) setPartners(prev => [j.data, ...prev])
  }

  async function handleDelete(id: string) {
    if (!confirm('Xác nhận xóa partner này?')) return
    const res = await fetch(`/api/partners/${id}`, { method: 'DELETE' })
    if (res.ok) setPartners(prev => prev.filter(p => p.id !== id))
  }

  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        <form onSubmit={handleCreate} style={{display:'flex',gap:8}}>
          <input placeholder="Name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} />
          <select value={form.partner_type} onChange={e=>setForm({...form,partner_type:e.target.value})}>
            <option value="buyer">Buyer</option>
            <option value="middleman">Middleman</option>
            <option value="warehouse">Warehouse</option>
          </select>
          <input placeholder="Phone" value={form.contact_phone} onChange={e=>setForm({...form,contact_phone:e.target.value})} />
          <input placeholder="Address" value={form.address} onChange={e=>setForm({...form,address:e.target.value})} />
          <button type="submit" className={styles.btn}>Add</button>
        </form>

        <div style={{marginLeft:12}}>
          <input placeholder="Search address" value={query} onChange={e=>setQuery(e.target.value)} />
          <div className={styles.list}>
            {suggests.map((s,i)=> (
              <div key={i} className={styles.card} onClick={()=>{ setSelected({lat:s.lat,lng:s.lng}); setForm({...form,address:s.display_name}); setSuggests([]); setQuery('') }}>
                {s.display_name}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.mapContainer}>
        <MapContainer 
          center={[10.762622, 106.660172]} 
          zoom={6} 
          minZoom={6}
          maxBounds={[
            [8.0, 102.0], // Tây Nam
            [23.5, 109.5] // Đông Bắc
          ]}
          maxBoundsViscosity={1.0}
          style={{height:'100%',width:'100%'}}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {markers}
        </MapContainer>
      </div>

      <div className={styles.list}>
        {partners.map(p => (
          <div key={p.id} className={styles.card}>
            <div><strong>{p.name}</strong> ({p.partner_type})</div>
            <div>{p.address}</div>
            <div>{p.contact_phone}</div>
            <div style={{marginTop:8}}>
              <button className={styles.btn} onClick={()=>{ /* TODO: edit flow */ }}>Edit</button>
              <button className={`${styles.btn} ${styles.btnDanger}`} onClick={()=>handleDelete(p.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
