// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import { PageHeader } from '@/components/ui/PageHeader'
import { Users, Layers, Sprout, LandPlot } from 'lucide-react'
import { Stats } from '@/components/features/officer-web/parts'
import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ArrowRight, Phone, MapPin } from 'lucide-react'
import styles from '../households.module.css'
import { fetchJson } from '@/lib/api/fetch-json'

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
  const [loadFailed, setLoadFailed] = useState(false)

  const fetchHouseholds = useCallback(() => {
    setLoading(true)
    fetchJson<{ data?: HouseholdSummary[] }>('/api/farm/households')
      .then(j => { setHouseholds(j.data || []); setLoadFailed(false) })
      .catch(() => { setHouseholds([]); setLoadFailed(true) })
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

  const hectares = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })
  const totalArea = households.reduce((sum, h) => sum + h.total_area_ha, 0)

  return (
    <div className={styles.container}>
      <PageHeader
        icon={<Users size={28} />}
        title="Quản lý Nông hộ"
        description="Hộ thành viên, liên hệ và thửa đất đang phụ trách"
        actions={!showForm ? <button type="button" className={styles.createBtn} onClick={() => setShowForm(true)}>+ Thêm nông hộ</button> : undefined}
      />

      {!loading && !loadFailed && <Stats items={[
        { label: 'Tổng số nông hộ', value: households.length, icon: <Users /> },
        { label: 'Tổng số thửa', value: households.reduce((sum, h) => sum + h.parcel_count, 0), icon: <LandPlot /> },
        { label: 'Tổng diện tích', value: `${households.reduce((sum, h) => sum + h.total_area_ha, 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} ha`, icon: <Layers /> },
      ]} />}

      {showForm && (
        <form className={styles.formCard} onSubmit={handleCreate}>
          <h3 className={styles.formTitle}>Thêm nông hộ mới</h3>
          {error && <p className="text-danger text-sm mb-3">{error}</p>}
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
      ) : loadFailed ? (
        <div className={styles.empty}>Không thể tải danh sách nông hộ. Vui lòng thử lại sau.</div>
      ) : households.length === 0 ? (
        <div className={styles.empty}>Chưa có nông hộ nào. Hãy thêm nông hộ đầu tiên!</div>
      ) : (
        <div className={styles.grid}>
          {households.map(h => (
            <article key={h.id} className={styles.card}>
              <div className={styles.cardHead}>
                <span className={styles.mark} aria-hidden="true">{h.name.trim().split(/\s+/).slice(-2).map(word => word[0]).join('').toUpperCase()}</span>
                <div className={styles.headText}>
                  <span className={styles.cardName}>{h.name}</span>
                  <div className={styles.cardMeta}>
                    <span><Phone size={13} aria-hidden="true" /> {h.phone}</span>
                    {h.address && <span title={h.address}><MapPin size={13} aria-hidden="true" /> <span className={styles.address}>{h.address}</span></span>}
                  </div>
                </div>
              </div>
              <dl className={styles.facts}>
                <div><Layers size={15} aria-hidden="true" /><dt>Số thửa</dt><dd>{h.parcel_count}</dd></div>
                <div><Sprout size={15} aria-hidden="true" /><dt>Diện tích</dt><dd>{hectares(h.total_area_ha)} ha</dd></div>
              </dl>
              {totalArea > 0 && (
                <div className={styles.share}>
                  <progress value={h.total_area_ha} max={totalArea} aria-label={`Phần diện tích của ${h.name} trong HTX`} />
                  <span>{Math.round((h.total_area_ha / totalArea) * 100)}% diện tích HTX</span>
                </div>
              )}
              <Link href={`/officer/households/${h.id}`} className={styles.cardLink}>
                Xem chi tiết <span className={styles.go} aria-hidden="true"><ArrowRight size={14} /></span>
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
