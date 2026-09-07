// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState } from 'react'
import dynamic from 'next/dynamic'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import styles from '../wizard.module.css'

const SetupMapClient = dynamic(() => import('./SetupMapClient'), { ssr: false })

interface Props {
  householdName: string
  onPrev: () => void
  onNext: (area: number, geojson?: object, center?: { lat: number, lng: number }) => void
}

export function Step2MapDraw({ householdName, onPrev, onNext }: Props) {
  const [areaSqm, setAreaSqm] = useState(0)
  const [geojson, setGeojson] = useState<object | undefined>()
  const [center, setCenter] = useState<{ lat: number, lng: number } | undefined>()
  const isDrawn = areaSqm > 0

  return (
    <div className={styles.layout}>
      {/* Left Panel: Real Leaflet Map */}
      <div className={`${styles.leftPanel} ${styles.mapPanel}`}>
        <div className={styles.mapContainer}>
          <SetupMapClient onAreaCalculated={(sqm, geo, cen) => {
            setAreaSqm(sqm)
            setGeojson(geo)
            setCenter(cen)
          }} />
          <div className={styles.drawHintOverlay}>
            Sử dụng thanh công cụ để vẽ vùng trồng. Diện tích sẽ tự động tính toán.
          </div>
        </div>
      </div>

      {/* Right Panel: Area Form */}
      <div className={styles.rightPanel}>
        <h2 className={styles.panelTitle}>Diện tích tự tính</h2>
        
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Chủ thửa</label>
          <input className={styles.formInput} value={householdName} disabled />
        </div>
        
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Mã định danh thửa (Tự động)</label>
          <input className={styles.formInput} value="TP-045" disabled />
        </div>
        
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Diện tích (m2)</label>
          <div className={styles.flexGap}>
            <input 
              className={styles.formInput} 
              value={areaSqm > 0 ? areaSqm.toLocaleString('vi-VN') : ""} 
              placeholder="0" 
              disabled 
            />
          </div>
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
              disabled={!isDrawn}
              onClick={() => onNext(areaSqm, geojson, center)}
            >
              Tiếp theo <ArrowRight size={16} className="inline ml-1 align-text-bottom" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
