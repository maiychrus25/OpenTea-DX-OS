// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect, useState, useCallback } from 'react'
import styles from '../households.module.css'

interface HouseholdSummary {
  id: string
  household_code: string
  name: string
  phone: string
  address: string | null
  parcel_count: number
  total_area_ha: number
}

export function HouseholdManager() {
  const [households, setHouseholds] = useState<HouseholdSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  // Form state
  const [ownerName, setOwnerName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const fetchHouseholds = useCallback(() => {
    setLoading(true)
    fetch('/api/farm/households')
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(j => setHouseholds(j.data || []))
      .catch(() => setHouseholds([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchHouseholds() }, [fetchHouseholds])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    const body = {
      household_code: phone, // use phone as code for simplicity
      owner_name: ownerName,
      phone,
      address: address || undefined,
    }

    try {
      const res = await fetch('/api/farm/households', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error?.message || 'Lỗi tạo nông hộ')
      }
      setOwnerName('')
      setPhone('')
      setAddress('')
      setShowForm(false)
      fetchHouseholds()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi không xác định')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Quản lý Nông hộ</h1>
        {!showForm && (
          <button className={styles.createBtn} onClick={() => setShowForm(true)}>+ Thêm nông hộ</button>
        )}
      </div>

      {showForm && (
        <form className={styles.formCard} onSubmit={handleCreate}>
          <h3 className={styles.formTitle}>Thêm nông hộ mới</h3>
          {error && <p style={{ color: 'var(--color-error)', marginBottom: '0.75rem', fontSize: '0.875rem' }}>{error}</p>}
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Tên chủ hộ *</label>
              <input className={styles.formInput} value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="Nguyễn Văn A" required />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Số điện thoại *</label>
              <input className={styles.formInput} value={phone} onChange={e => setPhone(e.target.value)} placeholder="0901234567" required />
            </div>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Địa chỉ</label>
            <input className={styles.formInput} value={address} onChange={e => setAddress(e.target.value)} placeholder="Xã ABC, Huyện XYZ" />
          </div>
          <div className={styles.formActions}>
            <button type="button" className={styles.cancelBtn} onClick={() => { setShowForm(false); setError('') }}>Hủy</button>
            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting ? 'Đang tạo...' : 'Tạo nông hộ'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className={styles.empty}>Đang tải...</div>
      ) : households.length === 0 ? (
        <div className={styles.empty}>Chưa có nông hộ nào. Hãy thêm nông hộ đầu tiên!</div>
      ) : (
        <div className={styles.grid}>
          {households.map(h => (
            <div key={h.id} className={styles.card}>
              <span className={styles.cardName}>{h.name}</span>
              <div className={styles.cardMeta}>
                <span>📞 {h.phone}</span>
                {h.address && <span>📍 {h.address}</span>}
              </div>
              <div className={styles.statRow}>
                <span className={styles.stat}>Thửa: <span className={styles.statValue}>{h.parcel_count}</span></span>
                <span className={styles.stat}>Diện tích: <span className={styles.statValue}>{h.total_area_ha.toFixed(2)} ha</span></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
