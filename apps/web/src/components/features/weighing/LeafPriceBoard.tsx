// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import kit from '@/components/features/farmer-web/kit.module.css'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import { clockVn, money } from '@/lib/weighing/format'
import styles from './weighing.module.css'

export interface LeafPriceRow {
  grade_id: string
  grade_name: string
  price_vnd_per_kg: number | null
  yesterday_vnd_per_kg: number | null
}

export interface TodayLeafPrices {
  date: string
  published_at: string | null
  prices: LeafPriceRow[]
}

const MAX_PRICE_VND = 10_000_000

/** Each grade's box starts at today's price, or yesterday's when today is not published yet. */
const startingValues = (prices: LeafPriceRow[]) =>
  Object.fromEntries(prices.map(p => [p.grade_id, String(p.price_vnd_per_kg ?? p.yesterday_vnd_per_kg ?? '')]))

interface Props {
  /** Bumped by the grade section, so a renamed, added or hidden grade shows up here at once. */
  revision: number
}

export function LeafPriceBoard({ revision }: Props) {
  const [today, setToday] = useState<TodayLeafPrices | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [loadError, setLoadError] = useState('')
  const [formError, setFormError] = useState('')
  const [publishing, setPublishing] = useState(false)

  useEffect(() => {
    fetchJson<{ data: TodayLeafPrices }>('/api/leaf-prices/today')
      .then(body => { setToday(body.data); setValues(startingValues(body.data.prices)); setLoadError('') })
      .catch(() => setLoadError(LOAD_FAILED_MESSAGE))
  }, [revision])

  async function publish() {
    if (!today) return
    for (const row of today.prices) {
      const n = Number(values[row.grade_id])
      if (!Number.isInteger(n) || n < 1 || n > MAX_PRICE_VND) {
        setFormError(`Nhập giá hợp lệ (từ 1 đến ${MAX_PRICE_VND.toLocaleString('vi-VN')} đ/kg) cho ${row.grade_name}.`)
        return
      }
    }
    setFormError('')
    setPublishing(true)
    try {
      const res = await fetch('/api/leaf-prices/today', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prices: today.prices.map(p => ({ grade_id: p.grade_id, price_vnd_per_kg: Number(values[p.grade_id]) })) }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setFormError(body?.error?.message || 'Không công bố được giá. Vui lòng thử lại.'); return }
      setToday(body.data)
      setValues(startingValues(body.data.prices))
    } catch {
      setFormError('Lỗi kết nối máy chủ.')
    } finally {
      setPublishing(false)
    }
  }

  if (loadError) return <p role="alert" className={styles.error}>{loadError}</p>
  if (!today) return <p className={kit.muted}>Đang tải...</p>

  return (
    <section className={kit.pn} aria-labelledby="leaf-price-title">
      <div className={kit.ph}><h2 id="leaf-price-title">Giá thu mua hôm nay</h2></div>
      {today.prices.length === 0 ? (
        <p className={`${kit.muted} ${styles.pad}`}>Chưa có phẩm cấp nào. Thêm phẩm cấp ở phần bên dưới.</p>
      ) : (
        <ul className={kit.list}>
          {today.prices.map(p => (
            <li key={p.grade_id} className={styles.priceRow}>
              <div className={styles.priceName}>
                <strong>{p.grade_name}</strong>
                {p.yesterday_vnd_per_kg != null && <span className={kit.muted}>Hôm qua: {money(p.yesterday_vnd_per_kg)} đ/kg</span>}
              </div>
              <label className={`${kit.fl} ${styles.priceInput}`}>
                Giá hôm nay (đ/kg)
                <input className={kit.inp} type="number" inputMode="numeric" min={1} max={MAX_PRICE_VND} step={1}
                  value={values[p.grade_id] ?? ''} disabled={publishing}
                  onChange={e => setValues(prev => ({ ...prev, [p.grade_id]: e.target.value }))} />
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.publishBar}>
        {formError && <p role="alert" className={styles.error}>{formError}</p>}
        {today.published_at && !formError && <p role="status" className={styles.status}>Đã công bố lúc {clockVn(today.published_at)}</p>}
        <Button size="lg" isLoading={publishing} disabled={today.prices.length === 0} onClick={publish}>Công bố giá hôm nay</Button>
      </div>
    </section>
  )
}
