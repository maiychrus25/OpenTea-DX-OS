// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import kit from '@/components/features/farmer-web/kit.module.css'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import { computeTicketPreview } from '@/lib/weighing/ticket-math'
import { dayMonth, dayMonthYear, money } from '@/lib/weighing/format'
import type { LeafTicket, WithdrawalStatus } from '@/lib/weighing/types'
import { HouseholdSearch, type HouseholdHit } from './HouseholdSearch'
import type { LeafPriceRow, TodayLeafPrices } from './LeafPriceBoard'
import styles from './weighing.module.css'

const QUICK_DEDUCTIONS = [0, 2, 5, 10]
const MAX_GROSS_KG = 5000
const MAX_DEDUCTION_PCT = 30
const GROSS_PATTERN = /^\d{1,4}(\.\d)?$/
const DEDUCTION_PATTERN = /^\d{1,2}(\.\d)?$/

/** 'checking' while the request runs; 'failed' locks the parcel, the same as a blocked one. */
type Light = WithdrawalStatus | 'checking' | 'failed'

const parseGross = (text: string) => {
  const kg = Number(text)
  return GROSS_PATTERN.test(text) && kg > 0 && kg <= MAX_GROSS_KG ? kg : null
}
const parseDeduction = (text: string) => {
  const pct = Number(text)
  return DEDUCTION_PATTERN.test(text) && pct >= 0 && pct <= MAX_DEDUCTION_PCT ? pct : null
}

function LightLabel({ light }: { light: Light | undefined }) {
  if (!light || light === 'checking') return <span className={styles.lightWait}>Đang kiểm tra cách ly...</span>
  if (light === 'failed') return <span className={styles.lightBlock}>Chưa kiểm được cách ly</span>
  if (!light.blocked) return <span className={styles.lightOk}>Đã qua cách ly</span>
  return <span className={styles.lightBlock}>{light.safe_from ? `Còn cách ly đến ${dayMonth(light.safe_from)}` : 'Còn cách ly'}</span>
}

interface Props {
  onSaved: () => void
  /** The area whose print page opens after saving. */
  printBase?: string
}

export function WeighingForm({ onSaved, printBase = '/accountant/weighing' }: Props) {
  const [formKey, setFormKey] = useState(0)
  const [prices, setPrices] = useState<LeafPriceRow[]>([])
  const [household, setHousehold] = useState<HouseholdHit | null>(null)
  const [parcelId, setParcelId] = useState<string | null>(null)
  const [lights, setLights] = useState<Record<string, Light>>({})
  const [gradeId, setGradeId] = useState<string | null>(null)
  const [grossText, setGrossText] = useState('')
  const [deductionText, setDeductionText] = useState('0')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const clientIdRef = useRef<string>()
  const pickRef = useRef(0)

  const loadPrices = () => fetchJson<{ data: TodayLeafPrices }>('/api/leaf-prices/today')
    .then(body => setPrices(body.data.prices))
    .catch(() => setError(LOAD_FAILED_MESSAGE))

  useEffect(() => { void loadPrices() }, [])

  function pickHousehold(h: HouseholdHit) {
    const pick = ++pickRef.current
    setHousehold(h)
    setParcelId(null)
    setError('')
    setLights(Object.fromEntries(h.parcels.map(p => [p.id, 'checking' as const])))
    for (const p of h.parcels) {
      fetchJson<{ data: WithdrawalStatus }>(`/api/parcels/${p.id}/withdrawal-status`)
        .then(body => { if (pick === pickRef.current) setLights(prev => ({ ...prev, [p.id]: body.data })) })
        .catch(() => { if (pick === pickRef.current) setLights(prev => ({ ...prev, [p.id]: 'failed' })) })
    }
  }

  function reset() {
    clientIdRef.current = undefined
    pickRef.current++
    setFormKey(k => k + 1)
    setHousehold(null)
    setParcelId(null)
    setLights({})
    setGradeId(null)
    setGrossText('')
    setDeductionText('0')
    setError('')
  }

  const grossKg = parseGross(grossText)
  const deductionPct = parseDeduction(deductionText)
  const grade = prices.find(p => p.grade_id === gradeId) ?? null
  const price = grade?.price_vnd_per_kg ?? null
  const parcelLight = parcelId ? lights[parcelId] : undefined
  const parcelOpen = typeof parcelLight === 'object' && !parcelLight.blocked
  const parcelCode = household?.parcels.find(p => p.id === parcelId)?.parcel_code ?? ''
  const preview = grossKg !== null && deductionPct !== null && price !== null ? computeTicketPreview(grossKg, deductionPct, price) : null
  const canSave = !!household && !!parcelId && parcelOpen && price !== null && grossKg !== null && deductionPct !== null && !saving

  async function save() {
    if (!canSave || !household || !parcelId || !grade || grossKg === null || deductionPct === null) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/leaf-tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          household_id: household.id,
          parcel_id: parcelId,
          grade_id: grade.grade_id,
          gross_kg: grossKg,
          deduction_pct: deductionPct,
          client_id: (clientIdRef.current ??= crypto.randomUUID()),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (body?.error?.code === 'PARCEL_IN_WITHDRAWAL') {
          setLights(prev => ({ ...prev, [parcelId]: { blocked: true, safe_from: body.error.safe_from ?? null } }))
        }
        if (body?.error?.code === 'NO_PRICE_TODAY') void loadPrices()
        setError(body?.error?.message || 'Không lưu được phiếu. Vui lòng thử lại.')
        return
      }
      window.open(`${printBase}/${(body.data as LeafTicket).id}/print`, '_blank')
      reset()
      onSaved()
    } catch {
      setError('Lỗi kết nối máy chủ.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={kit.pn} aria-labelledby="weighing-form-title">
      <div className={kit.ph}><h2 id="weighing-form-title">Lập phiếu cân</h2></div>
      <div className={styles.form}>
        <HouseholdSearch key={formKey} label="Hộ" onSelect={pickHousehold} />
        {household && (
          <>
            <p className={styles.chosen}>Hộ: <strong>{household.name}</strong></p>
            <fieldset className={styles.fieldset}>
              <legend>Nương</legend>
              {household.parcels.length === 0 && <p className={kit.muted}>Hộ này chưa có nương.</p>}
              <ul className={styles.parcelList}>
                {household.parcels.map(p => (
                  <li key={p.id}>
                    <button type="button" className={styles.parcel} aria-pressed={parcelId === p.id} onClick={() => setParcelId(p.id)}>
                      <strong>{p.parcel_code}</strong>
                      <LightLabel light={lights[p.id]} />
                    </button>
                  </li>
                ))}
              </ul>
              {parcelId && typeof parcelLight === 'object' && parcelLight.blocked && (
                <p role="status" className={styles.reason}>
                  {parcelLight.safe_from
                    ? `Nương ${parcelCode} còn trong thời gian cách ly đến ${dayMonthYear(parcelLight.safe_from)}. Không được cân búp thương phẩm.`
                    : `Nương ${parcelCode} còn trong thời gian cách ly. Không được cân búp thương phẩm.`}
                </p>
              )}
            </fieldset>
          </>
        )}

        <fieldset className={styles.fieldset}>
          <legend>Phẩm cấp</legend>
          <div className={styles.gradeList}>
            {prices.map(p => (
              <button key={p.grade_id} type="button" className={styles.grade} aria-pressed={gradeId === p.grade_id}
                disabled={p.price_vnd_per_kg === null} onClick={() => setGradeId(p.grade_id)}>
                <strong>{p.grade_name}</strong>
                <span className={kit.muted}>{p.price_vnd_per_kg === null ? 'Chưa công bố giá' : `${money(p.price_vnd_per_kg)} đ/kg`}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className={styles.fields}>
          <label className={kit.fl}>
            Kg cân
            <input className={kit.inp} type="number" inputMode="decimal" step="0.1" min={0} value={grossText}
              aria-invalid={grossText !== '' && grossKg === null} onChange={e => setGrossText(e.target.value)} />
          </label>
          <div className={kit.fl}>
            <label htmlFor="weighing-deduction">Trừ nước mưa và tạp chất (%)</label>
            <input id="weighing-deduction" className={kit.inp} type="number" inputMode="decimal" step="0.1" min={0} max={MAX_DEDUCTION_PCT}
              value={deductionText} aria-invalid={deductionPct === null} onChange={e => setDeductionText(e.target.value)} />
            <div className={styles.quick} role="group" aria-label="Chọn nhanh % trừ">
              {QUICK_DEDUCTIONS.map(v => (
                <button key={v} type="button" className={styles.quickBtn} aria-pressed={deductionText === String(v)} onClick={() => setDeductionText(String(v))}>{v}%</button>
              ))}
            </div>
          </div>
        </div>
        {grossText !== '' && grossKg === null && <p role="alert" className={styles.error}>Nhập kg cân lớn hơn 0 và tối đa 5000 kg, tối đa một chữ số thập phân.</p>}
        {deductionPct === null && deductionText !== '' && <p role="alert" className={styles.error}>Trừ từ 0 đến 30%, tối đa một chữ số thập phân.</p>}

        <dl className={styles.preview}>
          <div><dt>Kg tịnh</dt><dd>{preview ? `${preview.netKg.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg` : '—'}</dd></div>
          <div><dt>Thành tiền</dt><dd>{preview ? `${money(preview.amountVnd)} đ` : '—'}</dd></div>
        </dl>

        {error && <p role="alert" className={styles.error}>{error}</p>}
        <Button size="lg" isLoading={saving} disabled={!canSave} onClick={save}>Lưu phiếu</Button>
      </div>
    </section>
  )
}
