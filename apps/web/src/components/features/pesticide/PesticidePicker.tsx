// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useId, useMemo, useState } from 'react'
import { CUSTOM_PRODUCT_FLOOR_DAYS, loadPesticideCatalogue, type PesticideRow } from '@/lib/pesticide/catalogue'
import styles from './PesticidePicker.module.css'

export type PesticideValue = { productId: string | null; customName: string; days: number | null }
export type PesticideChange = PesticideValue & { floorDays: number; productName?: string }

export const GROUP_LABELS: Record<PesticideRow['group'], string> = {
  BOTANICAL: 'Thảo mộc', MICROBIAL: 'Vi sinh', BIOLOGICAL: 'Sinh học', CHEMICAL: 'Hóa học', ANTIBIOTIC: 'Kháng sinh',
}
export const NEEDS_LABEL_CHECK_TEXT = 'Mức sàn mặc định — cần đối chiếu nhãn thực tế'
export const belowFloorText = (floorDays: number) => `Thời gian cách ly không được thấp hơn ${floorDays} ngày`

/** True when the typed days are under the floor; empty days are filled by the server. */
export const isBelowFloor = (v: Pick<PesticideChange, 'days' | 'floorDays'>) => v.days !== null && v.days < v.floorDays

interface Props {
  /** floorDays is optional: a prefilled value gets its floor from the catalogue once it loads. */
  value: PesticideValue & { floorDays?: number }
  onChange: (value: PesticideChange) => void
  target?: string
  disabled?: boolean
  /** Select only: a catalogue product, no days box and no "Thuốc khác" (used for prescriptions and item links): no days box and no "Thuốc khác". */
  selectOnly?: boolean
}

export function PesticidePicker({ value, onChange, target, disabled, selectOnly }: Props) {
  const id = useId()
  const [rows, setRows] = useState<PesticideRow[]>([])
  const [query, setQuery] = useState('')
  const [loadFailed, setLoadFailed] = useState(false)
  const [other, setOther] = useState(!value.productId && value.customName !== '')

  useEffect(() => {
    let live = true
    loadPesticideCatalogue(target)
      .then(list => { if (live) { setRows(list); setLoadFailed(false) } })
      .catch(() => { if (live) setLoadFailed(true) })
    return () => { live = false }
  }, [target])

  const selected = rows.find(r => r.id === value.productId) ?? null
  const floorDays = selected ? selected.floor_days : CUSTOM_PRODUCT_FLOOR_DAYS
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? rows.filter(r => `${r.trade_name} ${r.active_ingredient}`.toLowerCase().includes(q)) : rows
  }, [rows, query])
  const selectedFloor = selected?.floor_days
  const selectedName = selected?.trade_name
  const stale = selectedFloor !== undefined && value.floorDays !== selectedFloor
  const below = isBelowFloor({ days: value.days, floorDays })

  useEffect(() => {
    if (stale) onChange({ productId: value.productId, customName: value.customName, days: value.days, floorDays: selectedFloor, productName: selectedName })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stale, selectedFloor])

  const emit = (next: PesticideValue, floor = floorDays, productName?: string) => onChange({ ...next, floorDays: floor, productName })
  const pick = (row: PesticideRow) => { setOther(false); emit({ productId: row.id, customName: '', days: row.floor_days }, row.floor_days, row.trade_name) }
  const pickOther = () => { setOther(true); emit({ productId: null, customName: value.customName, days: CUSTOM_PRODUCT_FLOOR_DAYS }, CUSTOM_PRODUCT_FLOOR_DAYS) }

  return (
    <div className={styles.picker}>
      <label className={styles.field} htmlFor={`${id}-q`}>
        Tìm thuốc
        <input id={`${id}-q`} type="search" className={styles.input} value={query} disabled={disabled}
          onChange={e => setQuery(e.target.value)} placeholder="Tên thương mại hoặc hoạt chất" />
      </label>

      {loadFailed && <p className={styles.hint} role="status">Không tải được danh mục thuốc. Bạn vẫn chọn được “Thuốc khác”.</p>}

      <div role="group" aria-label="Danh mục thuốc" className={styles.list}>
        {shown.map(row => (
          <button key={row.id} type="button" className={styles.option} aria-pressed={row.id === value.productId}
            disabled={disabled} onClick={() => pick(row)}>
            <span className={styles.name}>{row.trade_name}</span>
            <span className={styles.meta}>{GROUP_LABELS[row.group]} · {row.active_ingredient} · cách ly {row.floor_days} ngày</span>
            {row.needs_label_check && <span className={styles.check}>{NEEDS_LABEL_CHECK_TEXT}</span>}
          </button>
        ))}
        {!selectOnly && <button type="button" className={styles.option} aria-pressed={other} disabled={disabled} onClick={pickOther}>
          <span className={styles.name}>Thuốc khác (ngoài danh mục)</span>
          <span className={styles.meta}>Mức sàn {CUSTOM_PRODUCT_FLOOR_DAYS} ngày, cán bộ sẽ xem lại</span>
        </button>}
      </div>

      {other && (
        <label className={styles.field} htmlFor={`${id}-name`}>
          Tên thuốc
          <input id={`${id}-name`} className={styles.input} value={value.customName} disabled={disabled} maxLength={200}
            onChange={e => emit({ ...value, productId: null, customName: e.target.value }, CUSTOM_PRODUCT_FLOOR_DAYS)} placeholder="VD: Thuốc đang dùng" />
        </label>
      )}

      {!selectOnly && <label className={styles.field} htmlFor={`${id}-days`}>
        Số ngày cách ly
        <input id={`${id}-days`} type="number" min={0} inputMode="numeric" className={styles.input} disabled={disabled}
          value={value.days ?? ''} aria-invalid={below} aria-describedby={below ? `${id}-err` : undefined}
          onChange={e => emit({ ...value, days: e.target.value === '' ? null : Number(e.target.value) }, floorDays, selected?.trade_name)} />
      </label>}
      {below && !selectOnly && <p id={`${id}-err`} className={styles.error} role="alert">{belowFloorText(floorDays)}</p>}
    </div>
  )
}
