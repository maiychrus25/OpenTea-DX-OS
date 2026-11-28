// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect, useState } from 'react'
import { X, Plus } from 'lucide-react'
import styles from '../journal.module.css'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import { PesticidePicker, isBelowFloor, type PesticideChange } from '@/components/features/pesticide/PesticidePicker'
import { CUSTOM_PRODUCT_FLOOR_DAYS } from '@/lib/pesticide/catalogue'
import { freshLeafError, freshLeafKg, hasProductFields } from '@/lib/journal/activity-fields'

interface Parcel {
  id: string
  parcel_code: string
  crop_type: string
}

interface Activity {
  activity_type: string
  product_name: string
  dosage: string
  freshLeaf: string
  pesticide: PesticideChange
}

const emptyPesticide = (): PesticideChange => ({ productId: null, customName: '', days: null, floorDays: CUSTOM_PRODUCT_FLOOR_DAYS })
const newActivity = (activity_type: string): Activity => ({ activity_type, product_name: '', dosage: '', freshLeaf: '', pesticide: emptyPesticide() })

interface JournalFormProps {
  onSuccess: () => void
  onCancel: () => void
}

const ACTIVITY_TYPES = [
  { value: 'SPRAYING', label: 'Phun thuốc BVTV' },
  { value: 'FERTILIZING', label: 'Bón phân' },
  { value: 'IRRIGATION', label: 'Tưới tiêu' },
  { value: 'HARVEST', label: 'Thu hoạch' },
  { value: 'SOWING', label: 'Trồng mới' },
  { value: 'PRUNING', label: 'Đốn chè' },
  { value: 'OTHER', label: 'Khác' },
]

export function JournalForm({ onSuccess, onCancel }: JournalFormProps) {
  const [parcels, setParcels] = useState<Parcel[]>([])
  const [parcelId, setParcelId] = useState('')
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10))
  const [observation, setObservation] = useState('')
  const [activities, setActivities] = useState<Activity[]>([
    newActivity('SPRAYING'),
  ])
  const [submitting, setSubmitting] = useState(false)
  const [attempted, setAttempted] = useState(false)
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

  function updateActivity<K extends keyof Activity>(idx: number, field: K, value: Activity[K]) {
    setActivities(prev => prev.map((a, i) => i === idx ? { ...a, [field]: value } : a))
  }

  function addActivity() {
    setActivities(prev => [...prev, newActivity('OTHER')])
  }

  function removeActivity(idx: number) {
    setActivities(prev => prev.filter((_, i) => i !== idx))
  }

  const belowFloor = activities.some(a => a.activity_type === 'SPRAYING' && isBelowFloor(a.pesticide))
  // The fresh leaf weight is optional for officers, but a value typed in must be valid.
  const leafInvalid = activities.some(a => a.activity_type === 'HARVEST' && freshLeafError(a.freshLeaf, false))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setAttempted(true)
    if (leafInvalid) return
    setSubmitting(true)
    setError('')

    const body = {
      parcel_id: parcelId,
      entry_date: entryDate,
      observation,
      activities: activities.map(a => a.activity_type === 'SPRAYING' ? {
        activity_type: a.activity_type,
        product_name: a.pesticide.productName || a.pesticide.customName || undefined,
        pesticide_product_id: a.pesticide.productId ?? undefined,
        dosage: a.dosage || undefined,
        withdrawal_days: a.pesticide.days ?? undefined,
      } : {
        activity_type: a.activity_type,
        product_name: hasProductFields(a.activity_type) ? a.product_name || undefined : undefined,
        dosage: hasProductFields(a.activity_type) ? a.dosage || undefined : undefined,
        fresh_leaf_kg: a.activity_type === 'HARVEST' ? freshLeafKg(a.freshLeaf) : undefined,
      }),
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

      {error && <p style={{ color: 'var(--color-danger)', marginBottom: '1rem' }}>{error}</p>}

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
        <textarea className={styles.formTextarea} value={observation} onChange={e => setObservation(e.target.value)} placeholder="Chè sinh trưởng tốt, không sâu bệnh..." />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Hoạt động</label>
        {activities.map((a, idx) => (
          <div key={idx} className={styles.activityBlock}>
            <div className={styles.activityRow}>
              <select className={styles.formSelect} aria-label="Loại hoạt động" value={a.activity_type} onChange={e => updateActivity(idx, 'activity_type', e.target.value)}>
                {ACTIVITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {a.activity_type !== 'SPRAYING' && hasProductFields(a.activity_type) && (
                <input className={styles.formInput} aria-label="Tên sản phẩm" placeholder="Tên sản phẩm" value={a.product_name} onChange={e => updateActivity(idx, 'product_name', e.target.value)} />
              )}
              {hasProductFields(a.activity_type) && (
                <input className={styles.formInput} aria-label="Liều lượng" placeholder="Liều lượng" value={a.dosage} onChange={e => updateActivity(idx, 'dosage', e.target.value)} />
              )}
              {a.activity_type === 'HARVEST' && (
                <input className={styles.formInput} type="number" inputMode="decimal" step="any" aria-label="Sản lượng búp tươi (kg)" placeholder="Sản lượng búp tươi (kg)" value={a.freshLeaf} aria-invalid={attempted && !!freshLeafError(a.freshLeaf, false)} onChange={e => updateActivity(idx, 'freshLeaf', e.target.value)} />
              )}
              {activities.length > 1 && (
                <button type="button" className={styles.removeBtn} onClick={() => removeActivity(idx)} aria-label="Xóa hoạt động">
                  <X size={16} />
                </button>
              )}
            </div>
            {attempted && a.activity_type === 'HARVEST' && freshLeafError(a.freshLeaf, false) && (
              <p className={styles.errorText} role="alert">{freshLeafError(a.freshLeaf, false)}</p>
            )}
            {a.activity_type === 'SPRAYING' && (
              <PesticidePicker value={a.pesticide} onChange={v => updateActivity(idx, 'pesticide', v)} />
            )}
          </div>
        ))}
        <button type="button" className={styles.addActivityBtn} onClick={addActivity}>
          <Plus size={16} className="inline mr-1 align-text-bottom" /> Thêm hoạt động
        </button>
      </div>

      <div className={styles.formActions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>Hủy</button>
        <button type="submit" className={styles.submitBtn} disabled={submitting || belowFloor}>
          {submitting ? 'Đang lưu...' : 'Lưu nhật ký'}
        </button>
      </div>
    </form>
  )
}
