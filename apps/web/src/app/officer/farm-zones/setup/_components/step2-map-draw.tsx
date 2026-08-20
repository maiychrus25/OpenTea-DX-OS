// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState } from 'react'
import styles from '../wizard.module.css'

interface Props {
  householdName: string
  onPrev: () => void
  onNext: (area: number) => void
}

export function Step2MapDraw({ householdName, onPrev, onNext }: Props) {
  const [isDrawn, setIsDrawn] = useState(false)

  return (
    <div className={styles.layout}>
      {/* Left Panel: Map Canvas Mock */}
      <div className={`${styles.leftPanel} ${styles.mapPanel}`}>
        <div className={styles.mapMock}>
          <img 
            src="https://a.tile.openstreetmap.org/10/815/487.png" 
            alt="Map background" 
            className={styles.mapImg}
          />
          {isDrawn && (
            <div className={styles.polygonMock}>
              Đang vẽ...
            </div>
          )}
          <div className={styles.drawHint}>
            Vẽ polygon quanh khu vực canh tác của {householdName} - diện tích sẽ tự tính
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
              value={isDrawn ? "2.400" : ""} 
              placeholder="0" 
              disabled 
            />
            {!isDrawn && (
              <button 
                type="button"
                className={styles.btnSecondary} 
                onClick={() => setIsDrawn(true)}
              >
                Giả lập vẽ
              </button>
            )}
          </div>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.btnSecondary} onClick={onPrev}>
            ← Trước
          </button>
          <div className={styles.actionsRight}>
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={!isDrawn}
              onClick={() => onNext(2400)}
            >
              Tiếp theo →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
