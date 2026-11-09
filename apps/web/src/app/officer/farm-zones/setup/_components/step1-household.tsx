// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState, useEffect } from 'react'
import { Users, ArrowRight } from 'lucide-react'
import styles from '../wizard.module.css'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'

interface Household {
  id: string
  name: string
  parcelCount: number
}

interface Props {
  selectedHouseholdId: string | null
  onSelect: (h: Household) => void
  onNext: () => void
}

export function Step1Household({ selectedHouseholdId, onSelect, onNext }: Props) {
  const [newOwner, setNewOwner] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [households, setHouseholds] = useState<Household[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [htxProfileId, setHtxProfileId] = useState<string | null>(null)

  useEffect(() => {
    // We should fetch HTX Profile ID from context/session in real app
    // For now we pass a placeholder or get it from an endpoint
    // We can fetch '/api/profile' to get the current manager/officer HTX
    async function load() {
      try {
        const htxRes = await fetch('/api/profile')
        const htxData = await htxRes.json()
        if (htxData.data?.id) {
          setHtxProfileId(htxData.data.id)
          const data = await fetchJson<{ data: any[] }>(`/api/farm/households?htxProfileId=${htxData.data.id}`)
          setHouseholds(data.data.map((h: any) => ({
            id: h.id,
            name: h.name,
            parcelCount: h.parcel_count || 0
          })))
        }
      } catch {
        setLoadFailed(true)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className={styles.layout}>
      {/* Left Panel: Household List */}
      <div className={styles.leftPanel}>
        <h2 className={styles.panelTitle}>Danh sách nông hộ</h2>
        {loadFailed && <p className="text-red-500 text-sm mb-3">{LOAD_FAILED_MESSAGE}</p>}
        <div className={styles.householdList}>
          {households.map((h) => (
            <button
              key={h.id}
              type="button"
              className={`${styles.householdCard} ${selectedHouseholdId === h.id ? styles.selected : ''}`}
              onClick={() => onSelect(h)}
            >
              <div className={styles.householdIcon}>
                <Users size={22} className="text-emerald-700" />
              </div>
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
          className={`${styles.btnSecondary} ${styles.btnFull}`}
          disabled={!newOwner || isLoading}
          onClick={async () => {
            if (newOwner) {
              setIsLoading(true)
              try {
                if (htxProfileId) {
                  const res = await fetch('/api/farm/households', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      household_code: 'HD-' + crypto.randomUUID().substring(0, 6).toUpperCase(),
                      owner_name: newOwner,
                      phone: newPhone
                    })
                  })
                  if (res.ok) {
                    const data = await res.json()
                    const newH = { id: data.data.id, name: data.data.name || data.data.owner_name, parcelCount: 0 }
                    setHouseholds([newH, ...households])
                    onSelect(newH)
                    setNewOwner('')
                    setNewPhone('')
                  } else {
                    const err = await res.json().catch(()=>({}))
                    alert('Lỗi tạo nông hộ: ' + (err?.error?.message || 'Không rõ'))
                  }
                }
              } catch {
                // Failed to create household — handled silently
              } finally {
                setIsLoading(false)
              }
            }
          }}
        >
          {isLoading ? 'Đang thêm...' : 'Thêm hộ'}
        </button>

        <div className={styles.actions}>
          <div className={styles.actionsRight}>
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={!selectedHouseholdId}
              onClick={onNext}
            >
              Tiếp theo <ArrowRight size={16} className="inline ml-1 align-text-bottom" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
