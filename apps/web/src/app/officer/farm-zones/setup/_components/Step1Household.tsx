// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState } from 'react'
import styles from '../wizard.module.css'

interface Household {
  id: string
  name: string
  parcelCount: number
}

const MOCK_HOUSEHOLDS: Household[] = [
  { id: 'hd1', name: 'Nguyễn Văn Bình', parcelCount: 3 },
  { id: 'hd2', name: 'Trần Thị Hà', parcelCount: 1 },
  { id: 'hd3', name: 'Lê Văn Tám', parcelCount: 0 },
]

interface Props {
  selectedHouseholdId: string | null
  onSelect: (h: Household) => void
  onNext: () => void
}

export function Step1Household({ selectedHouseholdId, onSelect, onNext }: Props) {
  const [newOwner, setNewOwner] = useState('')
  const [newPhone, setNewPhone] = useState('')

  return (
    <div className={styles.layout}>
      {/* Left Panel: Household List */}
      <div className={styles.leftPanel}>
        <h2 className={styles.panelTitle}>Danh sách nông hộ</h2>
        <div className={styles.householdList}>
          {MOCK_HOUSEHOLDS.map((h) => (
            <button
              key={h.id}
              type="button"
              className={`${styles.householdCard} ${selectedHouseholdId === h.id ? styles.selected : ''}`}
              onClick={() => onSelect(h)}
            >
              <div className={styles.householdIcon}>🧑‍🌾</div>
              <div>
                <span className={styles.householdName}>{h.name}</span>
                <span className={styles.householdMeta}>{h.parcelCount} thửa</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right Panel: Add Form */}
      <div className={styles.rightPanel}>
        <h2 className={styles.panelTitle}>Thêm hộ mới</h2>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Tên chủ hộ</label>
          <input
            className={styles.formInput}
            value={newOwner}
            onChange={(e) => setNewOwner(e.target.value)}
            placeholder="VD: Nguyễn Văn A"
          />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Số điện thoại</label>
          <input
            className={styles.formInput}
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder="0901234567"
          />
        </div>
        <button
          type="button"
          className={styles.btnSecondary}
          style={{ width: '100%' }}
          onClick={() => {
            if (newOwner) {
              const newH = { id: `hd_${Date.now()}`, name: newOwner, parcelCount: 0 }
              MOCK_HOUSEHOLDS.unshift(newH)
              onSelect(newH)
              setNewOwner('')
              setNewPhone('')
            }
          }}
        >
          Thêm hộ
        </button>

        <div className={styles.actions}>
          <div className={styles.actionsRight}>
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={!selectedHouseholdId}
              onClick={onNext}
            >
              Tiếp theo →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
