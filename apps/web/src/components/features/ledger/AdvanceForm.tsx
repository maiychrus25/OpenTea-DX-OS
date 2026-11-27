// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import kit from '@/components/features/farmer-web/kit.module.css'
import { HouseholdSearch, type HouseholdHit } from '@/components/features/weighing/HouseholdSearch'
import { advanceAmount, formatVnd, parseQuantity } from '@/lib/ledger/money'
import type { InputItem } from '@/lib/ledger/types'
import styles from './ledger.module.css'

interface Props {
  /** Active items only. */
  items: InputItem[]
  onSaved: () => void
}

/** Quick advance: household, item and quantity, with the amount worked out as the user types. */
export function AdvanceForm({ items, onSaved }: Props) {
  const [formKey, setFormKey] = useState(0)
  const [household, setHousehold] = useState<HouseholdHit | null>(null)
  const [itemId, setItemId] = useState('')
  const [quantityText, setQuantityText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const clientIdRef = useRef<string>()

  const item = items.find(i => i.id === itemId) ?? null
  const quantity = parseQuantity(quantityText)
  const amount = item && quantity !== null ? advanceAmount(quantity, item.unit_price_vnd) : null
  const canSave = !!household && !!item && quantity !== null && !saving

  async function save() {
    if (!household || !item || quantity === null) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/input-advances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ household_id: household.id, item_id: item.id, quantity, client_id: (clientIdRef.current ??= crypto.randomUUID()) }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json?.error?.message || 'Không ghi được phiếu ứng. Vui lòng thử lại.'); return }
      // A saved advance clears the form, so the next one starts with a new client_id.
      clientIdRef.current = undefined
      setFormKey(k => k + 1)
      setHousehold(null)
      setItemId('')
      setQuantityText('')
      onSaved()
    } catch {
      setError('Lỗi kết nối máy chủ.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={kit.pn} aria-labelledby="advance-form-title">
      <div className={kit.ph}><h2 id="advance-form-title">Cấp ứng vật tư</h2></div>
      <div className={styles.form}>
        <HouseholdSearch key={formKey} label="Hộ" onSelect={setHousehold} />
        {household && <p className={styles.chosen}>Hộ: <strong>{household.name}</strong></p>}
        <div className={styles.formGrid}>
          <label className={kit.fl}>
            Vật tư
            <select className={kit.inp} value={itemId} onChange={e => setItemId(e.target.value)}>
              <option value="">Chọn vật tư</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.name} ({formatVnd(String(i.unit_price_vnd))} đ/{i.unit})</option>)}
            </select>
          </label>
          <label className={kit.fl}>
            Số lượng{item ? ` (${item.unit})` : ''}
            <input className={kit.inp} type="number" inputMode="decimal" step="0.01" min={0} value={quantityText}
              aria-invalid={quantityText !== '' && quantity === null} onChange={e => setQuantityText(e.target.value)} />
          </label>
        </div>
        {quantityText !== '' && quantity === null && <p role="alert" className={styles.error}>Nhập số lượng lớn hơn 0, tối đa hai chữ số thập phân.</p>}
        <dl className={styles.preview}>
          <div><dt>Thành tiền</dt><dd>{amount === null ? '—' : `${formatVnd(String(amount))} đ`}</dd></div>
        </dl>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <Button size="lg" isLoading={saving} disabled={!canSave} onClick={save}>Ghi phiếu ứng</Button>
      </div>
    </section>
  )
}
