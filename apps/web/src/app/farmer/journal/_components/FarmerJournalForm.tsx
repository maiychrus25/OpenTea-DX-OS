// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect, useState } from 'react'
import styles from '../journal.module.css'
import kit from '@/components/features/farmer-web/kit.module.css'
import { ImageIcon, Send } from 'lucide-react'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import { ACTIVITY_TYPES, type JournalPrefill } from './journal-prefill'
import { PesticidePicker, isBelowFloor, type PesticideChange } from '@/components/features/pesticide/PesticidePicker'
import { CUSTOM_PRODUCT_FLOOR_DAYS } from '@/lib/pesticide/catalogue'

interface Parcel {
  id: string
  parcel_code: string
  crop_type: string
}

interface FarmerJournalFormProps {
  onSuccess: () => void
  onCancel: () => void
  /** Values from the chat card's Sửa button; anything invalid is dropped. */
  initial?: JournalPrefill
}

export function FarmerJournalForm({ onSuccess, onCancel, initial }: FarmerJournalFormProps) {
  const [parcels, setParcels] = useState<Parcel[]>([])
  const [parcelId, setParcelId] = useState('')
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10))
  const [activityType, setActivityType] = useState(initial?.activityType ?? 'OTHER')
  const [productName, setProductName] = useState(initial?.productName ?? '')
  const [hasChemicals, setHasChemicals] = useState(true)
  const [dosage, setDosage] = useState(initial?.dosage ?? '')
  const [performer, setPerformer] = useState('')
  const [pesticide, setPesticide] = useState<PesticideChange>({
    productId: null,
    customName: initial?.activityType === 'SPRAYING' ? (initial.productName ?? '') : '',
    days: initial?.withdrawalDays ?? null,
    floorDays: CUSTOM_PRODUCT_FLOOR_DAYS,
  })
  const [observation, setObservation] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchJson<{ data?: Parcel[] }>('/api/farm/parcels')
      .then(j => {
        const list = j.data || []
        setParcels(list)
        if (list.length > 0) setParcelId(list.find(p => p.id === initial?.parcelId)?.id ?? list[0].id)
      })
      .catch(() => { setParcels([]); setError(LOAD_FAILED_MESSAGE) })
  }, [initial?.parcelId])

  const spraying = activityType === 'SPRAYING'
  const sprayingWithProduct = hasChemicals && spraying
  const belowFloor = sprayingWithProduct && isBelowFloor(pesticide)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    const body = {
      parcel_id: parcelId,
      entry_date: entryDate,
      observation,
      activities: [{
        activity_type: activityType,
        product_name: !hasChemicals ? undefined
          : spraying ? (pesticide.productName || pesticide.customName || undefined) : (productName || undefined),
        pesticide_product_id: sprayingWithProduct ? (pesticide.productId ?? undefined) : undefined,
        dosage: sprayingWithProduct ? dosage : undefined,
        performer: sprayingWithProduct ? performer : undefined,
        withdrawal_days: sprayingWithProduct ? (pesticide.days ?? undefined) : undefined,
      }],
    }

    try {
      let photo_url: string | undefined
      let photo_minio_key: string | undefined

      if (photo) {
        setUploadingPhoto(true)
        const ext = photo.name.split('.').pop() || 'jpg'
        const filename = `journal-${Date.now()}.${ext}`
        
        // Get presigned URL
        const presignRes = await fetch('/api/journal/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename, contentType: photo.type })
        })
        if (!presignRes.ok) throw new Error('Không thể lấy đường dẫn tải ảnh')
        const { data: { uploadUrl, key } } = await presignRes.json()

        // Upload directly to MinIO
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': photo.type },
          body: photo
        })
        if (!uploadRes.ok) throw new Error('Lỗi tải ảnh lên hệ thống')

        photo_minio_key = key
        // Need the final URL (without presign params) for simple storage if needed, but minio_key is primary.
        // Actually the backend will generate public URL. We just pass minio_key.
        photo_url = key // Temporary, backend should construct real URL or use presigned later
      }

      // Add photo to body
      Object.assign(body, { photo_url, photo_minio_key })

      const res = await fetch('/api/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error?.message || 'Lỗi ghi nhật ký')
      }
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi không xác định')
    } finally {
      setSubmitting(false)
      setUploadingPhoto(false)
    }
  }

  const field = (label: string, control: React.ReactNode) => (
    <label className={kit.fl}>{label}{control}</label>
  )

  return (
    <form onSubmit={handleSubmit} className={styles.entryForm} aria-label="Ghi nhật ký">
      {error && <p className={styles.errorText}>{error}</p>}

      <div className={`${styles.two} ${kit.two}`}>
        {field('Thửa đất', (
          <select className={`${kit.inp} ${styles.tall}`} value={parcelId} onChange={e => setParcelId(e.target.value)} disabled={parcels.length === 0}>
            {parcels.length === 0 && <option value="">Chưa có thửa đất được phân công</option>}
            {parcels.map(p => (
              <option key={p.id} value={p.id}>{p.parcel_code} — {p.crop_type}</option>
            ))}
          </select>
        ))}
        {field('Ngày', <input className={`${kit.inp} ${styles.tall}`} type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} />)}
      </div>

      <div className={kit.fl}>
        <span id="activity-label">Hoạt động</span>
        <div className={styles.filters} role="group" aria-labelledby="activity-label">
          {ACTIVITY_TYPES.map(t => (
            <button key={t.value} type="button" className={`${kit.seg} ${styles.tallChip}`} aria-pressed={activityType === t.value} onClick={() => setActivityType(t.value)}>{t.label}</button>
          ))}
        </div>
      </div>

      <label className={styles.check}>
        <input type="checkbox" checked={!hasChemicals} onChange={e => setHasChemicals(!e.target.checked)} />
        Không sử dụng thuốc / phân bón trong lần ghi này
      </label>

      {hasChemicals && !spraying && field('Sản phẩm sử dụng', <input className={`${kit.inp} ${styles.tall}`} value={productName} onChange={e => setProductName(e.target.value)} placeholder="VD: Phân NPK 16-16-8" />)}
      {sprayingWithProduct && (
        <>
          <PesticidePicker value={pesticide} onChange={setPesticide} />
          <div className={`${styles.two} ${kit.two}`}>
            {field('Liều lượng', <input className={`${kit.inp} ${styles.tall}`} value={dosage} onChange={e => setDosage(e.target.value)} placeholder="VD: 50ml/bình 16L" />)}
            {field('Người thực hiện', <input className={`${kit.inp} ${styles.tall}`} value={performer} onChange={e => setPerformer(e.target.value)} placeholder="VD: Nguyễn Văn A" />)}
          </div>
        </>
      )}

      {field('Ghi chú', <textarea className={`${kit.inp} ${styles.area}`} value={observation} onChange={e => setObservation(e.target.value)} placeholder="Chè đang ra búp đều..." />)}

      <label className={kit.fl}>
        Hình ảnh thực tế (tùy chọn)
        <span className={styles.drop}>
          <ImageIcon size={22} aria-hidden="true" />
          {photo ? `Đã chọn: ${photo.name}` : 'Nhấn để chọn ảnh (JPEG, PNG)'}
          <input type="file" accept="image/jpeg, image/png" className={styles.fileInput} onChange={e => e.target.files && setPhoto(e.target.files[0])} />
        </span>
      </label>

      <div className={styles.entryActions}>
        <button type="button" className={`${kit.btn2} ${styles.tall}`} onClick={onCancel}>Hủy</button>
        <button type="submit" className={`${kit.btn} ${styles.tall}`} disabled={submitting || uploadingPhoto || !parcelId || belowFloor}>
          <Send size={16} aria-hidden="true" />
          {submitting || uploadingPhoto ? 'Đang gửi...' : 'Gửi chờ duyệt'}
        </button>
      </div>
    </form>
  )
}
