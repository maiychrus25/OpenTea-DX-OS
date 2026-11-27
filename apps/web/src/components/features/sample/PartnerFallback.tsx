// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useState } from 'react'
import { SamplePartners } from './SampleLists'
import mapStyles from '@/components/features/map/ZoneMap.module.css'

/** Render only after the parent successfully loads an empty real partner list. */
export function PartnerFallback() {
  const [category, setCategory] = useState('all')
  return (
    <>
      <div className={mapStyles.chips} role="group" aria-label="Loại đối tác mẫu">
        {['all', 'Thu mua', 'Vật tư', 'Vận chuyển'].map(type => (
          <button key={type} type="button" className={mapStyles.chip} aria-pressed={category === type} onClick={() => setCategory(type)}>
            {type === 'all' ? 'Tất cả' : type}
          </button>
        ))}
      </div>
      <SamplePartners bare category={category} />
    </>
  )
}
