// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState } from 'react'
import { Pill } from '@/components/ui'
import styles from '../wizard.module.css'

interface Props {
  householdName: string
  area: number
  onPrev: () => void
  onComplete: () => void
}

const CROP_OPTIONS = [
  'Lúa ST25',
  'Lúa OM18',
  'Lúa Đài Thơm 8',
  'Cải ngọt',
  'Xà lách',
]

export function Step3CropAssign({ householdName, area, onPrev, onComplete }: Props) {
  const [crop, setCrop] = useState(CROP_OPTIONS[3]) // Default: Cải ngọt
  const [season, setSeason] = useState('Hè Thu 2026')
  const [yieldEst, setYieldEst] = useState('4.5')
  
  return (
    <div className={styles.layout}>
      {/* Left Panel: Crop Form */}
      <div className={styles.leftPanel}>
        <h2 className={styles.panelTitle}>Gán cây trồng</h2>
        
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Cây trồng</label>
          <select className={styles.formSelect} value={crop} onChange={(e) => setCrop(e.target.value)}>
            {CROP_OPTIONS.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Mùa vụ</label>
          <input className={styles.formInput} value={season} onChange={(e) => setSeason(e.target.value)} />
        </div>
        
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Thành viên chịu trách nhiệm</label>
          <input className={styles.formInput} value={householdName} disabled />
        </div>
        
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Năng suất ước tính (tấn/ha)</label>
          <input className={styles.formInput} type="number" step="0.1" value={yieldEst} onChange={(e) => setYieldEst(e.target.value)} />
        </div>
      </div>

      {/* Right Panel: Summary */}
      <div className={styles.rightPanel}>
        <h2 className={styles.panelTitle}>Tóm tắt thiết lập</h2>
        
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Chủ hộ:</span>
          <span className={styles.summaryValue}>{householdName}</span>
        </div>
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Thửa đất:</span>
          <span className={styles.summaryValue}>TP-045 - {area.toLocaleString()} m2</span>
        </div>
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Cây trồng:</span>
          <span className={styles.summaryValue}>{crop} ({season})</span>
        </div>
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Trạng thái:</span>
          <span className={styles.summaryValue}>
            <Pill tone="green">Đang gieo</Pill>
          </span>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.btnSecondary} onClick={onPrev}>
            ← Trước
          </button>
          <div className={styles.actionsRight}>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={onComplete}
            >
              ✓ Hoàn tất thiết lập
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
