// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect, useState } from 'react'
import { X, Plus } from 'lucide-react'
import styles from '../journal.module.css'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'

interface Parcel {
  id: string
  parcel_code: string
  crop_type: string
}

interface Activity {
  activity_type: string
  product_name: string
  dosage: string
  withdrawal_days: string
}

interface JournalFormProps {
  onSuccess: () => void
  onCancel: () => void
}

const ACTIVITY_TYPES = [
  { value: 'SPRAYING', label: 'Phun thuốc BVTV' },
  { value: 'FERTILIZING', label: 'Bón phân' },
  { value: 'IRRIGATION', label: 'Tưới tiêu' },
  { value: 'HARVEST', label: 'Thu hoạch' },
  { value: 'SOWING', label: 'Gieo sạ' },
  { value: 'OTHER', label: 'Khác' },
]

export function JournalForm({ onSuccess, onCancel }: JournalFormProps) {
  const [parcels, setParcels] = useState<Parcel[]>([])
  const [parcelId, setParcelId] = useState('')
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10))
  const [observation, setObservation] = useState('')
  const [activities, setActivities] = useState<Activity[]>([
    { activity_type: 'SPRAYING', product_name: '', dosage: '', withdrawal_days: '' },
  ])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchJson<{ data?: Parcel[] }>('/api/farm/parcels')
      .then(j => {
        const list = j.data || []
        setParcels(list)
        if (list.length > 0) setParcelId(list[0].id)
      })
      .catch(() => { setParcels([]); setError(LOAD_FAILED_MESSAGE) })
  }, [])

  function updateActivity(idx: number, field: keyof Activity, value: string) {
    setActivities(prev => prev.map((a, i) => i === idx ? { ...a, [field]: value } : a))
  }

  function addActivity() {
    setActivities(prev => [...prev, { activity_type: 'OTHER', product_name: '', dosage: '', withdrawal_days: '' }])
  }

  function removeActivity(idx: number) {
    setActivities(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    const body = {
      parcel_id: parcelId,
      entry_date: entryDate,
      observation,
      activities: activities.map(a => ({
        activity_type: a.activity_type,
        product_name: a.product_name || undefined,
        dosage: a.dosage || undefined,
        withdrawal_days: a.withdrawal_days ? parseInt(a.withdrawal_days, 10) : undefined,
      })),
    }

    try {
      const res = await fetch('/api/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error?.message || 'Lỗi tạo nhật ký')
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
      <h2 className={styles.modalTitle}>Ghi nhật ký mới</h2>

      {error && <p style={{ color: 'var(--color-error)', marginBottom: '1rem' }}>{error}</p>}

      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Thửa đất</label>
        <select className={styles.formSelect} value={parcelId} onChange={e => setParcelId(e.target.value)}>
          {parcels.map(p => (
            <option key={p.id} value={p.id}>{p.parcel_code} — {p.crop_type}</option>
          ))}
        </select>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Ngày ghi</label>
        <input className={styles.formInput} type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Ghi chú quan sát</label>
        <textarea className={styles.formTextarea} value={observation} onChange={e => setObservation(e.target.value)} placeholder="Lúa sinh trưởng tốt, không sâu bệnh..." />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Hoạt động</label>
        {activities.map((a, idx) => (
          <div key={idx} className={styles.activityRow}>
            <select className={styles.formSelect} value={a.activity_type} onChange={e => updateActivity(idx, 'activity_type', e.target.value)}>
              {ACTIVITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input className={styles.formInput} placeholder="Tên sản phẩm" value={a.product_name} onChange={e => updateActivity(idx, 'product_name', e.target.value)} />
            <input className={styles.formInput} placeholder="Liều lượng" value={a.dosage} onChange={e => updateActivity(idx, 'dosage', e.target.value)} />
            {activities.length > 1 && (
              <button type="button" className={styles.removeBtn} onClick={() => removeActivity(idx)} aria-label="Xóa hoạt động">
                <X size={16} />
              </button>
            )}
          </div>
        ))}
        <button type="button" className={styles.addActivityBtn} onClick={addActivity}>
          <Plus size={16} className="inline mr-1 align-text-bottom" /> Thêm hoạt động
        </button>
      </div>

      <div className={styles.formActions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>Hủy</button>
        <button type="submit" className={styles.submitBtn} disabled={submitting}>
          {submitting ? 'Đang lưu...' : 'Lưu nhật ký'}
        </button>
      </div>
    </form>
  )
}
