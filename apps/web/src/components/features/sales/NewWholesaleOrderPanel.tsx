// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import kit from '@/components/features/farmer-web/kit.module.css'
import { DRY_TEA_GRADE_LABELS, type DryTeaGrade } from '@/domain/processing/grades'
import { localDay } from '@/domain/shared/local-day'
import { fetchJson } from '@/lib/api/fetch-json'
import { formatVnd } from '@/lib/ledger/money'
import { gramsText, kgTextToG, lineAmountText, parsePrice, sumVnd } from '@/lib/sales/format'
import { salesErrorText } from '@/lib/sales/errors'
import type { SellableLot } from '@/lib/sales/types'
import styles from './sales.module.css'

const MAX_LINES = 50
const DUE_DAYS = 30

interface Partner {
  id: string
  name: string
}

interface Line {
  key: number
  lotId: string
  kgText: string
  priceText: string
}

/** Adds days to a Vietnam day (YYYY-MM-DD) without a timezone shift. */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function gradeText(lot: SellableLot): string {
  return lot.dry_grade ? DRY_TEA_GRADE_LABELS[lot.dry_grade as DryTeaGrade] : lot.quality_grade ?? '—'
}

/** A wholesale order: partner, dates, lines drawn from lot stock, and the total as the user types. */
export function NewWholesaleOrderPanel({ basePath }: { basePath: string }) {
  const today = localDay(new Date())
  const [partners, setPartners] = useState<Partner[] | null>(null)
  const [partnersError, setPartnersError] = useState('')
  const [lots, setLots] = useState<SellableLot[] | null>(null)
  const [partnerId, setPartnerId] = useState('')
  const [orderedOn, setOrderedOn] = useState(today)
  const [dueOn, setDueOn] = useState(addDays(today, DUE_DAYS))
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<Line[]>([{ key: 1, lotId: '', kgText: '', priceText: '' }])
  const [nextKey, setNextKey] = useState(2)
  const [error, setError] = useState('')
  const [stockRows, setStockRows] = useState<{ lot_id: string; remaining_g: number }[] | null>(null)
  const [created, setCreated] = useState<{ id: string; order_no: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchJson<{ data: Partner[] }>('/api/partners')
      .then(body => setPartners(body.data))
      .catch(() => setPartnersError('Chưa tải được danh sách đối tác.'))
    fetchJson<{ data: SellableLot[] }>('/api/sales/sellable-lots')
      .then(body => setLots(body.data))
      .catch(() => setLots([]))
  }, [])

  const lotById = new Map((lots ?? []).map(l => [l.lot_id, l]))

  function updateLine(key: number, patch: Partial<Line>) {
    setLines(prev => prev.map(l => (l.key === key ? { ...l, ...patch } : l)))
  }

  function lineAmount(line: Line): string | null {
    const grams = kgTextToG(line.kgText)
    const price = parsePrice(line.priceText)
    return grams !== null && price !== null ? lineAmountText(grams, price) : null
  }

  const amounts = lines.map(lineAmount)
  const total = amounts.every(a => a !== null) ? sumVnd(amounts as string[]) : null

  function validate(): string | null {
    if (!partnerId) return 'Chọn đối tác mua.'
    if (dueOn < orderedOn) return 'Hạn thanh toán không được trước ngày lập đơn.'
    for (const line of lines) {
      if (!line.lotId) return 'Chọn lô cho từng dòng.'
      if (kgTextToG(line.kgText) === null) return 'Nhập kg lớn hơn 0, một chữ số thập phân.'
      if (parsePrice(line.priceText) === null) return 'Nhập giá bán mỗi kg là số nguyên từ 1 đến 10.000.000 đ.'
    }
    return null
  }

  async function save() {
    const problem = validate()
    if (problem) { setError(problem); return }
    setBusy(true)
    setError('')
    setStockRows(null)
    try {
      const res = await fetch('/api/sales/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partner_id: partnerId,
          ordered_on: orderedOn,
          due_on: dueOn,
          ...(note.trim() ? { note: note.trim() } : {}),
          lines: lines.map(l => ({ lot_id: l.lotId, kg: kgTextToG(l.kgText)! / 1000, price_vnd_per_kg: parsePrice(l.priceText)! })),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok) { setCreated({ id: json.data.id, order_no: json.data.order_no }); return }
      if (json?.error?.code === 'LOT_STOCK_SHORT' && Array.isArray(json.error.stock)) {
        setStockRows(json.error.stock)
      }
      setError(salesErrorText(json?.error?.code, json?.error?.message, 'Không lưu được đơn bán.'))
    } catch {
      setError('Lỗi kết nối máy chủ.')
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    return (
      <section className={kit.pn} aria-labelledby="order-created-title">
        <div className={kit.ph}><h2 id="order-created-title">Đã lập đơn bán</h2></div>
        <div className={styles.form}>
          <p role="status" className={styles.status}>Đã lập đơn {created.order_no}.</p>
          <Link href={`${basePath}/sales/${created.id}`} className={styles.primaryLink}>Mở đơn {created.order_no}</Link>
        </div>
      </section>
    )
  }

  return (
    <section className={kit.pn} aria-labelledby="new-order-title">
      <div className={kit.ph}><h2 id="new-order-title">Đơn bán sỉ mới</h2></div>
      <div className={styles.form}>
        <label className={kit.fl}>
          Đối tác mua
          <select className={kit.inp} value={partnerId} disabled={!partners} onChange={e => setPartnerId(e.target.value)}>
            <option value="">Chọn đối tác</option>
            {(partners ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        {partnersError && <p role="status" className={styles.error}>{partnersError}</p>}
        <div className={styles.formGrid}>
          <label className={kit.fl}>
            Ngày lập đơn
            <input className={kit.inp} type="date" value={orderedOn} onChange={e => { setOrderedOn(e.target.value); if (dueOn < e.target.value) setDueOn(e.target.value) }} />
          </label>
          <label className={kit.fl}>
            Hạn thanh toán
            <input className={kit.inp} type="date" value={dueOn} min={orderedOn} onChange={e => setDueOn(e.target.value)} />
          </label>
        </div>

        <fieldset className={styles.fieldset}>
          <legend>Các dòng chè</legend>
          {lines.map((line, index) => {
            const lot = lotById.get(line.lotId)
            return (
              <div key={line.key} className={styles.lineRow}>
                <label className={kit.fl}>
                  Lô
                  <select className={kit.inp} aria-label={`Lô dòng ${index + 1}`} value={line.lotId} onChange={e => updateLine(line.key, { lotId: e.target.value })}>
                    <option value="">Chọn lô</option>
                    {(lots ?? []).map(l => (
                      <option key={l.lot_id} value={l.lot_id}>{l.lot_code} · {gradeText(l)} · còn {gramsText(l.remaining_g)}</option>
                    ))}
                  </select>
                </label>
                <label className={kit.fl}>
                  Kg
                  <input className={kit.inp} type="number" inputMode="decimal" step="0.1" min={0} aria-label={`Kg dòng ${index + 1}`}
                    value={line.kgText} onChange={e => updateLine(line.key, { kgText: e.target.value })} />
                </label>
                <label className={kit.fl}>
                  Giá (đ/kg)
                  <input className={kit.inp} type="number" inputMode="numeric" step="1" min={1} aria-label={`Giá dòng ${index + 1}`}
                    value={line.priceText} onChange={e => updateLine(line.key, { priceText: e.target.value })} />
                </label>
                <p className={styles.lineAmount}>
                  {amounts[index] === null ? '—' : `${formatVnd(amounts[index] as string)} đ`}
                  {lot && kgTextToG(line.kgText) !== null && kgTextToG(line.kgText)! > lot.remaining_g ? <span className={styles.error}> Vượt tồn lô</span> : null}
                </p>
                <Button size="sm" variant="secondary" aria-label={`Bỏ dòng ${index + 1}`} disabled={lines.length === 1}
                  onClick={() => setLines(prev => prev.filter(l => l.key !== line.key))}>Bỏ dòng</Button>
              </div>
            )
          })}
          <Button variant="secondary" disabled={lines.length >= MAX_LINES} onClick={() => { setLines(prev => [...prev, { key: nextKey, lotId: '', kgText: '', priceText: '' }]); setNextKey(k => k + 1) }}>
            Thêm dòng
          </Button>
        </fieldset>

        <p className={styles.total}>Tổng tiền: <strong>{total === null ? '—' : `${formatVnd(total)} đ`}</strong></p>
        <label className={kit.fl}>
          Ghi chú (tuỳ chọn)
          <input className={kit.inp} maxLength={500} value={note} onChange={e => setNote(e.target.value)} />
        </label>

        {error && <p role="alert" className={styles.error}>{error}</p>}
        {stockRows && (
          <ul className={styles.plainList} aria-label="Tồn còn lại của các lô">
            {stockRows.map(r => (
              <li key={r.lot_id}>{lotById.get(r.lot_id)?.lot_code ?? r.lot_id} còn {gramsText(r.remaining_g)}</li>
            ))}
          </ul>
        )}
        <Button isLoading={busy} onClick={save}>Lập đơn bán</Button>
      </div>
    </section>
  )
}
