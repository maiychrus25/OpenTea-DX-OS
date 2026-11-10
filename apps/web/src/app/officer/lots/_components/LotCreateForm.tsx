// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect, useState } from 'react'
import styles from '../lots.module.css'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'

interface Parcel {
  id: string
  parcel_code: string
  crop_type: string
}

interface LotCreateFormProps {
  onSuccess: () => void
  onCancel: () => void
}

export function LotCreateForm({ onSuccess, onCancel }: LotCreateFormProps) {
  const [parcels, setParcels] = useState<Parcel[]>([])
  const [selectedParcels, setSelectedParcels] = useState<string[]>([])
  const [crop, setCrop] = useState('')
  const [harvestDate, setHarvestDate] = useState(new Date().toISOString().slice(0, 10))
  const [weight, setWeight] = useState('')
  const [packagingType, setPackagingType] = useState('')
  const [destination, setDestination] = useState('')
  const [buyerName, setBuyerName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchJson<{ data?: Parcel[] }>('/api/farm/parcels')
      .then(j => setParcels(j.data || []))
      .catch(() => { setParcels([]); setError(LOAD_FAILED_MESSAGE) })
  }, [])

  function toggleParcel(id: string) {
    setSelectedParcels(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (selectedParcels.length === 0) {
      setError('Vui lòng chọn ít nhất 1 thửa đất')
      return
    }
    setSubmitting(true)
    setError('')

    const body = {
      crop,
      harvest_date: harvestDate,
      estimated_weight_kg: weight ? parseFloat(weight) : undefined,
      parcel_ids: selectedParcels,
      packaging_type: packagingType || undefined,
      destination: destination || undefined,
      buyer_name: buyerName || undefined,
    }

    try {
      const res = await fetch('/api/lots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error?.message || 'Lỗi tạo lô hàng')
      }
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi không xác định')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2 className={styles.modalTitle}>Tạo Lô hàng mới</h2>

      {error && <p style={{ color: 'var(--color-error)', marginBottom: '1rem' }}>{error}</p>}

      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Loại nông sản *</label>
        <input className={styles.formInput} value={crop} onChange={e => setCrop(e.target.value)} placeholder="VD: Chè Trung du" required />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Ngày thu hoạch *</label>
        <input className={styles.formInput} type="date" value={harvestDate} onChange={e => setHarvestDate(e.target.value)} required />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Khối lượng ước tính (kg)</label>
        <input className={styles.formInput} type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder="2500" />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Chọn thửa đất *</label>
        <div className={styles.parcelCheckList}>
          {parcels.length === 0 ? (
            <span style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>Chưa có thửa đất</span>
          ) : (
            parcels.map(p => (
              <label key={p.id} className={styles.parcelCheckItem}>
                <input type="checkbox" checked={selectedParcels.includes(p.id)} onChange={() => toggleParcel(p.id)} />
                {p.parcel_code} — {p.crop_type}
              </label>
            ))
          )}
        </div>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Quy cách đóng gói</label>
        <input className={styles.formInput} value={packagingType} onChange={e => setPackagingType(e.target.value)} placeholder="Túi 25kg" />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Nơi giao hàng</label>
        <input className={styles.formInput} value={destination} onChange={e => setDestination(e.target.value)} placeholder="Cty TNHH..." />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Tên người mua</label>
        <input className={styles.formInput} value={buyerName} onChange={e => setBuyerName(e.target.value)} placeholder="Nguyễn Văn Mua" />
      </div>

      <div className={styles.formActions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>Hủy</button>
        <button type="submit" className={styles.submitBtn} disabled={submitting}>
          {submitting ? 'Đang tạo...' : 'Tạo lô hàng'}
        </button>
      </div>
    </form>
  )
}
