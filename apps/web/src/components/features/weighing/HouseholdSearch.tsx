// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import kit from '@/components/features/farmer-web/kit.module.css'
import styles from './weighing.module.css'

export interface HouseholdHit {
  id: string
  name: string
  phone: string | null
  parcels: { id: string; parcel_code: string }[]
}

interface Props {
  label: string
  onSelect: (household: HouseholdHit) => void
}

/** Search by name or phone; the parent remounts it (via key) to clear the box. */
export function HouseholdSearch({ label, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<HouseholdHit[]>([])
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setHits([]); setSearched(false); setError(''); return }
    let live = true
    const timer = setTimeout(() => {
      fetch(`/api/households?q=${encodeURIComponent(q)}`)
        .then(res => { if (!res.ok) throw new Error('search'); return res.json() })
        .then(body => { if (live) { setHits(body.data ?? []); setSearched(true); setError('') } })
        .catch(() => { if (live) setError('Không tìm được hộ. Vui lòng thử lại.') })
    }, 250)
    return () => { live = false; clearTimeout(timer) }
  }, [query])

  return (
    <div className={styles.search}>
      <label className={kit.fl}>
        {label}
        <input className={kit.inp} type="search" value={query} placeholder="Tên hoặc số điện thoại"
          onChange={e => setQuery(e.target.value)} />
      </label>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {hits.length > 0 && (
        <ul className={styles.hits} aria-label="Kết quả tìm hộ">
          {hits.map(h => (
            <li key={h.id}>
              <button type="button" className={styles.hit} onClick={() => onSelect(h)}>
                <strong>{h.name}</strong>
                {h.phone && <span className={kit.muted}>{h.phone}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {searched && !error && hits.length === 0 && <p className={kit.muted}>Không tìm thấy hộ nào.</p>}
    </div>
  )
}
