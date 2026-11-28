// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import Link from 'next/link'
import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import kit from '@/components/features/farmer-web/kit.module.css'
import { DRY_TEA_GRADES, DRY_TEA_GRADE_LABELS, type DryTeaGrade } from '@/domain/processing/grades'
import { fetchJson } from '@/lib/api/fetch-json'
import { processingErrorText } from '@/lib/processing/errors'
import type { DryStockRow } from '@/lib/processing/types'
import { dayMonthYear } from '@/lib/weighing/format'
import styles from './lots.module.css'

const MAX_SOURCES = 50
const kg = (value: number) => value.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
/** Positive kg with at most one decimal, up to 100000. */
const parseKg = (text: string) => (/^\d{1,6}(\.\d)?$/.test(text) && Number(text) > 0 && Number(text) <= 100000 ? Number(text) : null)

interface Props {
  /** "/officer" or "/manager": the lot links point into the caller's own area. */
  basePath: string
}

/** Đóng lô từ mẻ: pick a grade, take kg from the dry stock lines, add the packaging, and create the lot. */
export function LotFromBatchesPanel({ basePath }: Props) {
  const [grade, setGrade] = useState<DryTeaGrade | ''>('')
  const [stock, setStock] = useState<DryStockRow[] | null>(null)
  const [stockError, setStockError] = useState('')
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [packagingType, setPackagingType] = useState('')
  const [destination, setDestination] = useState('')
  const [buyerName, setBuyerName] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<{ lotCode: string } | null>(null)
  const [busy, setBusy] = useState(false)

  /** Stock rows with their boxes prefilled to what is left. */
  function applyStock(rows: DryStockRow[]) {
    setStock(rows)
    setDraft(Object.fromEntries(rows.map(r => [r.output_id, String(r.remaining_kg)])))
  }

  /** Loads the stock of one grade; keeps any notice on screen. */
  async function loadStock(next: DryTeaGrade) {
    setStockError('')
    try {
      const body = await fetchJson<{ data: DryStockRow[] }>(`/api/dry-stock?grade=${next}`)
      applyStock(body.data)
    } catch {
      setStockError('Không tải được tồn chè khô. Vui lòng thử lại.')
    }
  }

  async function chooseGrade(next: DryTeaGrade | '') {
    setGrade(next)
    setStock(null)
    setError('')
    setNotice(null)
    if (next) await loadStock(next)
  }

  function buildSources(): { output_id: string; kg: number }[] | null {
    if (!stock) return null
    const sources: { output_id: string; kg: number }[] = []
    for (const row of stock) {
      const text = (draft[row.output_id] ?? '').trim()
      if (text === '') continue
      const value = parseKg(text)
      if (value === null) { setError(`Nhập kg lấy từ ${row.batch_code} (lớn hơn 0, một chữ số thập phân).`); return null }
      if (value > row.remaining_kg) { setError(`Kg lấy từ ${row.batch_code} vượt tồn ${kg(row.remaining_kg)} kg.`); return null }
      sources.push({ output_id: row.output_id, kg: value })
    }
    if (sources.length === 0) { setError('Chọn ít nhất một dòng tồn và nhập số kg lấy.'); return null }
    if (sources.length > MAX_SOURCES) { setError(`Một lô lấy tối đa ${MAX_SOURCES} dòng tồn.`); return null }
    return sources
  }

  async function create() {
    setError('')
    setNotice(null)
    if (!grade) { setError('Chọn hạng chè khô trước.'); return }
    const sources = buildSources()
    if (!sources) return
    setBusy(true)
    try {
      const res = await fetch('/api/lots/from-batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade,
          sources,
          ...(packagingType.trim() ? { packaging_type: packagingType.trim() } : {}),
          ...(destination.trim() ? { destination: destination.trim() } : {}),
          ...(buyerName.trim() ? { buyer_name: buyerName.trim() } : {}),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        setNotice({ lotCode: json.data.lot_code })
        setPackagingType(''); setDestination(''); setBuyerName('')
        // The stock changed by this lot; reload it so the table shows what is left.
        void loadStock(grade)
        return
      }
      if (json?.error?.code === 'STOCK_CHANGED') {
        const fresh = (json.error.stock ?? json.stock) as DryStockRow[] | undefined
        if (fresh) applyStock(fresh)
      }
      setError(processingErrorText(json?.error?.code, json?.error?.message, 'Không đóng được lô. Vui lòng thử lại.'))
    } catch {
      setError('Lỗi kết nối máy chủ.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={kit.pn} aria-labelledby="lot-from-batches-title">
      <div className={kit.ph}><h2 id="lot-from-batches-title">Đóng lô từ mẻ</h2></div>
      <div className={styles.form}>
        <label className={kit.fl}>
          Hạng chè khô
          <select className={kit.inp} value={grade} onChange={e => chooseGrade(e.target.value as DryTeaGrade | '')}>
            <option value="">Chọn hạng</option>
            {DRY_TEA_GRADES.map(g => <option key={g} value={g}>{DRY_TEA_GRADE_LABELS[g]}</option>)}
          </select>
        </label>

        {stockError && <p role="alert" className={styles.error}>{stockError}</p>}
        {grade && stock && stock.length === 0 && <p className={kit.muted}>Chưa có tồn chè khô hạng {DRY_TEA_GRADE_LABELS[grade]}.</p>}
        {stock && stock.length > 0 && (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead><tr><th>Mẻ</th><th>Ngày chế biến</th><th>Tồn (kg)</th><th>Kg lấy</th></tr></thead>
              <tbody>
                {stock.map(row => (
                  <tr key={row.output_id}>
                    <td>{row.batch_code}{row.out_of_band ? <span className={styles.outBand}> Lệch chuẩn</span> : null}</td>
                    <td>{dayMonthYear(row.processed_on)}</td>
                    <td>{kg(row.remaining_kg)}</td>
                    <td>
                      <input className={kit.inp} type="number" inputMode="decimal" step="0.1" min={0} aria-label={`Kg lấy từ ${row.batch_code}`}
                        value={draft[row.output_id] ?? ''} onChange={e => setDraft(prev => ({ ...prev, [row.output_id]: e.target.value }))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {stock && stock.length > 0 && (
          <div className={styles.formGrid}>
            <label className={kit.fl}>Cách đóng gói<input className={kit.inp} maxLength={80} value={packagingType} onChange={e => setPackagingType(e.target.value)} /></label>
            <label className={kit.fl}>Nơi đến<input className={kit.inp} maxLength={120} value={destination} onChange={e => setDestination(e.target.value)} /></label>
            <label className={kit.fl}>Người mua<input className={kit.inp} maxLength={120} value={buyerName} onChange={e => setBuyerName(e.target.value)} /></label>
          </div>
        )}

        {error && <p role="alert" className={styles.error}>{error}</p>}
        {notice && (
          <p role="status" className={styles.status}>
            Đã đóng lô {notice.lotCode}. <Link href={`${basePath}/lots/${notice.lotCode}/labels`} className={styles.link}>In tem cho lô này</Link>
          </p>
        )}
        {stock && stock.length > 0 && <Button isLoading={busy} onClick={create}>Đóng lô</Button>}
      </div>
    </section>
  )
}
