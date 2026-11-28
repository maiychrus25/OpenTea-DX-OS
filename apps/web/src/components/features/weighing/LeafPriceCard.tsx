// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import kit from '@/components/features/farmer-web/kit.module.css'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import { money } from '@/lib/weighing/format'
import type { TodayLeafPrices } from './LeafPriceBoard'
import styles from './weighing.module.css'
import { ListenButton } from '@/components/features/tts/ListenButton'
import { priceSentence } from '@/lib/tts/sentences'

/** Today's leaf price per grade for the farmer's dashboard; read-only. */
export function LeafPriceCard() {
  const [today, setToday] = useState<TodayLeafPrices | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchJson<{ data: TodayLeafPrices }>('/api/leaf-prices/today')
      .then(body => setToday(body.data))
      .catch(() => setError(LOAD_FAILED_MESSAGE))
  }, [])

  const published = today?.prices.filter(p => p.price_vnd_per_kg !== null) ?? []

  return (
    <section className={kit.pn} aria-labelledby="leaf-price-card-title">
      <div className={`${kit.ph} ${styles.farmerPriceHead}`}>
        <h2 id="leaf-price-card-title">Giá búp hôm nay</h2>
        {published.length > 0 && (
          <ListenButton text={priceSentence(published.map(p => ({ grade_name: p.grade_name, price_vnd_per_kg: p.price_vnd_per_kg ?? 0 })))} label="Nghe giá" />
        )}
      </div>
      {error && <p role="alert" className={`${styles.error} ${styles.pad}`}>{error}</p>}
      {!error && !today && <p className={`${kit.muted} ${styles.pad}`}>Đang tải...</p>}
      {today && published.length === 0 && <p className={`${kit.muted} ${styles.pad}`}>HTX chưa công bố giá hôm nay.</p>}
      {published.length > 0 && (
        <ul className={`${kit.list} ${styles.farmerPrices}`}>
          {published.map(p => (
            <li key={p.grade_id} className={styles.farmerPrice}>
              <strong>{p.grade_name}</strong>
              <span>{money(p.price_vnd_per_kg ?? 0)} đ/kg</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
