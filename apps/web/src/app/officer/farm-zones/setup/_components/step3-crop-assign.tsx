// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState } from 'react'
import { Pill } from '@/components/ui'
import { Check, ArrowLeft } from 'lucide-react'
import styles from '../wizard.module.css'

interface Props {
  householdId: string
  householdName: string
  area: number
  geojson?: object | null
  center?: { lat: number, lng: number } | null
  cropOptions: string[]
  onPrev: () => void
  onComplete: () => void
}

export function Step3CropAssign({ householdId, householdName, area, geojson, center, cropOptions, onPrev, onComplete }: Props) {
  // Default to the first option, fallback to empty string if array is empty
  const [crop, setCrop] = useState(cropOptions.length > 0 ? cropOptions[0] : '') 
  const [season, setSeason] = useState(`Lứa 1/${new Date().getFullYear()}`)
  const [yieldEst, setYieldEst] = useState('4.5')
  const [isLoading, setIsLoading] = useState(false)
  
  return (
    <div className={styles.layout}>
      {/* Left Panel: Crop Form */}
      <div className={styles.leftPanel}>
        <h2 className={styles.panelTitle}>Gán cây trồng</h2>
        
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Cây trồng</label>
          <select className={styles.formSelect} value={crop} onChange={(e) => setCrop(e.target.value)}>
            {cropOptions.map(c => (
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
            <ArrowLeft size={16} className="inline mr-1 align-text-bottom" />
            Trước
          </button>
          <div className={styles.actionsRight}>
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={isLoading}
              onClick={async () => {
                setIsLoading(true)
                try {
                  const res = await fetch('/api/farm/parcels', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      household_id: householdId,
                      parcel_code: 'TP-' + crypto.randomUUID().substring(0, 6).toUpperCase(),
                      geojson: geojson ? (geojson as any).geometry : { type: "Polygon", coordinates: [] },
                      area_ha: area / 10000,
                      centroid_lat: center?.lat || 10.0,
                      centroid_lng: center?.lng || 106.0,
                      current_crop: crop,
                      season: season
                    })
                  })
                  if (res.ok) {
                    onComplete()
                  } else {
                    alert('Lỗi khi thiết lập thửa đất')
                  }
                } catch {
                  // Failed to create parcel — handled silently
                } finally {
                  setIsLoading(false)
                }
              }}
            >
              {isLoading ? 'Đang lưu...' : (
                <>
                  <Check size={16} className="inline-block mr-1.5 align-text-bottom" />
                  Hoàn tất thiết lập
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
