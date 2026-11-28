// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { Sample } from '@/components/features/manager-web/parts'
import styles from './zones.module.css'

const ZONES = [
  { name: 'Khu A', area: '8,20 ha', shape: '4,40 22,24 55,13 53,25 34,38 9,49', x: 31, y: 30, tone: 'a' },
  { name: 'Khu B', area: '7,50 ha', shape: '62,16 96,26 92,46 62,54 52,44', x: 76, y: 35, tone: 'b' },
  { name: 'Khu C', area: '4,30 ha', shape: '16,54 28,47 47,57 41,73 22,76', x: 30, y: 63, tone: 'b' },
  { name: 'Khu D', area: '4,50 ha', shape: '52,75 67,55 95,60 92,80 78,86', x: 74, y: 70, tone: 'b' },
]

/** The design's zone picture, shown only while no parcel has a drawn boundary. The shapes are not real places. */
export function SampleZones() {
  return (
    <div className={styles.sample} role="img" aria-label="Bản đồ vùng trồng mẫu">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {ZONES.map((zone) => <polygon key={zone.name} points={zone.shape} className={styles[zone.tone]} />)}
      </svg>
      {ZONES.map((zone) => (
        <span key={zone.name} className={styles.label} style={{ left: `${zone.x}%`, top: `${zone.y}%` }}>
          <strong>{zone.name}</strong>{zone.area}
        </span>
      ))}
      <p className={styles.note}><Sample /> Chưa có thửa nào được vẽ ranh giới; hình và số liệu khu vực là minh hoạ.</p>
    </div>
  )
}
