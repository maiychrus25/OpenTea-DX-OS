// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import kit from '@/components/features/farmer-web/kit.module.css'
import { PesticidePicker } from '@/components/features/pesticide/PesticidePicker'
import { formatVnd } from '@/lib/ledger/money'
import type { InputItem } from '@/lib/ledger/types'
import styles from './ledger.module.css'

export const KIND_LABELS: Record<InputItem['kind'], string> = { FERTILIZER: 'Phân bón', PESTICIDE: 'Thuốc BVTV', OTHER: 'Khác' }

interface Draft {
  id: string | null
  name: string
  unit: string
  price: string
  kind: InputItem['kind']
  productId: string | null
}

const emptyDraft: Draft = { id: null, name: '', unit: '', price: '', kind: 'FERTILIZER', productId: null }

/** The first problem with a draft, in the words the form shows; null when it can be sent. */
function draftError(d: Draft): string | null {
  if (d.name.trim().length < 1 || d.name.trim().length > 80) return 'Nhập tên vật tư (tối đa 80 ký tự).'
  if (d.unit.trim().length < 1 || d.unit.trim().length > 20) return 'Nhập đơn vị (tối đa 20 ký tự), ví dụ kg, bao, chai.'
  if (!/^\d{1,9}$/.test(d.price) || Number(d.price) > 100000000) return 'Nhập đơn giá từ 0 đến 100.000.000 đ.'
  if (d.kind === 'PESTICIDE' && !d.productId) return 'Chọn thuốc trong danh mục thuốc.'
  return null
}

interface Props {
  items: InputItem[]
  onChanged: () => void
}

/** Add, edit and deactivate the HTX's input items. */
export function ItemCatalogue({ items, onChanged }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function send(url: string, method: 'POST' | 'PUT', body: object, fallback: string) {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json?.error?.message || fallback); return false }
      onChanged()
      return true
    } catch {
      setError('Lỗi kết nối máy chủ.')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!draft) return
    const problem = draftError(draft)
    if (problem) { setError(problem); return }
    const body = {
      name: draft.name.trim(),
      unit: draft.unit.trim(),
      unit_price_vnd: Number(draft.price),
      kind: draft.kind,
      pesticide_product_id: draft.kind === 'PESTICIDE' ? draft.productId : null,
    }
    const ok = draft.id
      ? await send(`/api/input-items/${draft.id}`, 'PUT', body, 'Không lưu được vật tư.')
      : await send('/api/input-items', 'POST', body, 'Không thêm được vật tư.')
    if (ok) setDraft(null)
  }

  const edit = (item: InputItem) => {
    setError('')
    setDraft({ id: item.id, name: item.name, unit: item.unit, price: String(item.unit_price_vnd), kind: item.kind, productId: item.pesticide_product_id })
  }

  return (
    <section className={kit.pn} aria-labelledby="item-catalogue-title">
      <div className={kit.ph}>
        <h2 id="item-catalogue-title">Danh mục vật tư</h2>
        <Button size="sm" variant="secondary" onClick={() => { setDraft(emptyDraft); setError('') }}>Thêm vật tư</Button>
      </div>
      {items.length === 0 && <p className={`${kit.muted} ${styles.pad}`}>Chưa có vật tư nào. Bấm “Thêm vật tư”.</p>}
      <ul className={kit.list}>
        {items.map(item => (
          <li key={item.id} className={styles.row}>
            <div className={styles.grow}>
              <strong>{item.name}</strong>
              <span className={kit.muted}>{KIND_LABELS[item.kind]} · {formatVnd(String(item.unit_price_vnd))} đ/{item.unit}{item.active ? '' : ' · đã ngừng dùng'}</span>
            </div>
            <div className={styles.rowActions}>
              <Button size="sm" variant="secondary" aria-label={`Sửa ${item.name}`} onClick={() => edit(item)}>Sửa</Button>
              <Button size="sm" variant="secondary" aria-label={`${item.active ? 'Ngừng dùng' : 'Dùng lại'} ${item.name}`} disabled={busy}
                onClick={() => send(`/api/input-items/${item.id}`, 'PUT', { active: !item.active }, 'Không đổi được trạng thái vật tư.')}>
                {item.active ? 'Ngừng dùng' : 'Dùng lại'}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {draft && (
        <div className={styles.pad}>
          <div className={styles.formGrid}>
            <label className={kit.fl}>
              Tên vật tư
              <input className={kit.inp} maxLength={80} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label className={kit.fl}>
              Đơn vị
              <input className={kit.inp} maxLength={20} value={draft.unit} placeholder="VD: kg, bao, chai" onChange={e => setDraft({ ...draft, unit: e.target.value })} />
            </label>
            <label className={kit.fl}>
              Đơn giá (đ)
              <input className={kit.inp} type="number" inputMode="numeric" min={0} max={100000000} step={1} value={draft.price} onChange={e => setDraft({ ...draft, price: e.target.value })} />
            </label>
            <label className={kit.fl}>
              Loại
              <select className={kit.inp} value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value as InputItem['kind'], productId: null })}>
                {(Object.keys(KIND_LABELS) as InputItem['kind'][]).map(k => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
              </select>
            </label>
          </div>
          {draft.kind === 'PESTICIDE' && (
            <PesticidePicker selectOnly value={{ productId: draft.productId, customName: '', days: null }}
              onChange={v => setDraft({ ...draft, productId: v.productId })} />
          )}
          {error && <p role="alert" className={styles.error}>{error}</p>}
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => { setDraft(null); setError('') }}>Hủy</Button>
            <Button isLoading={busy} onClick={save}>Lưu vật tư</Button>
          </div>
        </div>
      )}
      {!draft && error && <p role="alert" className={`${styles.error} ${styles.pad}`}>{error}</p>}
    </section>
  )
}
