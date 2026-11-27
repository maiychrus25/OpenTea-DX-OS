// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect, useRef, useState } from 'react'
import styles from '../journal.module.css'
import kit from '@/components/features/farmer-web/kit.module.css'
import { ImageIcon, Send } from 'lucide-react'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import { ACTIVITY_TYPES, type JournalPrefill } from './journal-prefill'
import { PesticidePicker, isBelowFloor, type PesticideChange } from '@/components/features/pesticide/PesticidePicker'
import { CUSTOM_PRODUCT_FLOOR_DAYS } from '@/lib/pesticide/catalogue'
import { uploadJournalPhoto, useJournalOfflineQueue, type JournalPayload } from '@/lib/hooks/useJournalOfflineQueue'

interface Parcel {
  id: string
  parcel_code: string
  crop_type: string
}

/** An entry of GET /api/journal, as far as the form edits it. */
export interface EditableEntry {
  id: string
  parcel_id?: string
  entry_date: string
  status: string
  activity_type: string
  notes: string | null
  activities: { product_name?: string | null; dosage?: string | null; performer?: string | null; withdrawal_days?: number | null; pesticide_product_id?: string | null }[]
}

interface FarmerJournalFormProps {
  /** Edit and resubmit a returned entry, or confirm a prescribed DRAFT ("Đã phun"). */
  entry?: EditableEntry
  onSuccess: () => void
  onCancel: () => void
  /** Values from the chat card's Sửa button; anything invalid is dropped. */
  initial?: JournalPrefill
}

export function FarmerJournalForm({ onSuccess, onCancel, initial: chatPrefill, entry }: FarmerJournalFormProps) {
  const first = entry?.activities[0]
  const initial: JournalPrefill | undefined = entry ? {
    parcelId: entry.parcel_id,
    activityType: entry.activity_type,
    productName: first?.product_name ?? undefined,
    dosage: first?.dosage ?? undefined,
    withdrawalDays: first?.withdrawal_days ?? undefined,
  } : chatPrefill
  const confirming = entry?.status === 'DRAFT'
  const queue = useJournalOfflineQueue()
  const clientIdRef = useRef<string>()
  const [parcels, setParcels] = useState<Parcel[]>([])
  const [parcelId, setParcelId] = useState(entry?.parcel_id ?? '')
  const [entryDate, setEntryDate] = useState(entry && !confirming ? entry.entry_date.slice(0, 10) : new Date().toISOString().slice(0, 10))
  const [activityType, setActivityType] = useState(initial?.activityType ?? 'OTHER')
  const [productName, setProductName] = useState(initial?.productName ?? '')
  const [hasChemicals, setHasChemicals] = useState(!entry || !!first?.product_name || first?.withdrawal_days != null)
  const [dosage, setDosage] = useState(initial?.dosage ?? '')
  const [performer, setPerformer] = useState(first?.performer ?? '')
  const [pesticide, setPesticide] = useState<PesticideChange>({
    productId: first?.pesticide_product_id ?? null,
    customName: initial?.activityType === 'SPRAYING' ? (initial.productName ?? '') : '',
    days: initial?.withdrawalDays ?? null,
    // A catalogue product's floor is unknown until the picker loads it; the server checks it anyway.
    floorDays: first?.pesticide_product_id ? 0 : CUSTOM_PRODUCT_FLOOR_DAYS,
  })
  const [observation, setObservation] = useState(entry?.notes ?? '')
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

    const body: Record<string, unknown> = {
      ...(entry ? { submit: true } : { parcel_id: parcelId, client_id: (clientIdRef.current ??= crypto.randomUUID()) }),
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
      // Offline: keep the entry (and the photo) on the device; the queue sends it once when the network is back.
      if (!entry && !navigator.onLine) {
        await queue.enqueue(body as unknown as JournalPayload, photo ?? undefined)
        onSuccess()
        return
      }

      if (photo) {
        setUploadingPhoto(true)
        const key = await uploadJournalPhoto(photo)
        // The backend builds the public URL from the key; the key stands in until then.
        Object.assign(body, { photo_url: key, photo_minio_key: key })
      }

      const res = await fetch(entry ? `/api/journal/${entry.id}` : '/api/journal', {
        method: entry ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error?.message || (entry ? 'Không thể gửi lại nhật ký' : 'Lỗi ghi nhật ký'))
      }
      onSuccess()
    } catch (err: unknown) {
      // A dropped connection (fetch rejects with TypeError) is queued, not shown as an error. Same client_id on any retry.
      if (!entry && err instanceof TypeError) {
        await queue.enqueue(body as unknown as JournalPayload, photo ?? undefined)
        onSuccess()
        return
      }
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
          <select className={`${kit.inp} ${styles.tall}`} value={parcelId} onChange={e => setParcelId(e.target.value)} disabled={parcels.length === 0 || !!entry}>
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
          {submitting || uploadingPhoto ? 'Đang gửi...' : confirming ? 'Đã phun' : entry ? 'Gửi lại' : 'Gửi chờ duyệt'}
        </button>
      </div>
    </form>
  )
}
