// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import kit from '@/components/features/farmer-web/kit.module.css'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import type { PesticideRow } from '@/lib/pesticide/catalogue'
import { GROUP_LABELS, NEEDS_LABEL_CHECK_TEXT } from './PesticidePicker'
import styles from './PesticideCatalogue.module.css'

export function PesticideCatalogue() {
  const [rows, setRows] = useState<PesticideRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<PesticideRow | null>(null)
  const [days, setDays] = useState('')
  const [note, setNote] = useState('')
  const [confirmLow, setConfirmLow] = useState(false)
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    fetchJson<{ data?: PesticideRow[] }>('/api/pesticides')
      .then(body => { setRows(body.data ?? []); setError('') })
      .catch(() => setError(LOAD_FAILED_MESSAGE))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const open = (row: PesticideRow) => {
    setEditing(row); setDays(String(row.label?.label_phi_days ?? row.floor_days)); setNote(row.label?.label_note ?? '')
    setConfirmLow(false); setFormError('')
  }
  const value = Number(days)
  const valid = Number.isInteger(value) && value >= 1 && value <= 365
  const below = !!editing && valid && value < editing.default_phi_days

  async function save() {
    if (!editing) return
    if (!valid) { setFormError('Số ngày cách ly phải từ 1 đến 365.'); return }
    if (below && !note.trim()) { setFormError('Nhập số lô hoặc mô tả nhãn khi thấp hơn mức mặc định.'); return }
    if (below && !confirmLow) { setFormError(''); setConfirmLow(true); return }
    setBusy(true); setFormError('')
    try {
      const res = await fetch(`/api/pesticides/${editing.id}/label`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label_phi_days: value, ...(note.trim() ? { label_note: note.trim() } : {}) }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setFormError(body?.error?.message || 'Không lưu được nhãn.'); setConfirmLow(false); return }
      setEditing(null); load()
    } catch { setFormError('Lỗi kết nối máy chủ.') } finally { setBusy(false) }
  }

  async function removeLabel(row: PesticideRow) {
    const res = await fetch(`/api/pesticides/${row.id}/label`, { method: 'DELETE' })
    if (res.ok) load(); else setError('Không gỡ được nhãn.')
  }

  return (
    <div className={kit.page}>
      <div className={kit.hd}>
        <div className={kit.hdText}>
          <h1 className={kit.h1}>Danh mục thuốc</h1>
          <p className={kit.sub}>Số ngày cách ly hiệu lực của HTX cho từng loại thuốc.</p>
        </div>
      </div>
      {loading && <p>Đang tải...</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead><tr><th>Thuốc</th><th>Nhóm</th><th>Ngày cách ly</th><th>Nguồn</th><th /></tr></thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id}>
                <td><strong>{row.trade_name}</strong><br /><span className={kit.muted}>{row.active_ingredient}</span></td>
                <td>{GROUP_LABELS[row.group]}</td>
                <td>{row.floor_days} ngày</td>
                <td>
                  {row.label ? <>Nhãn HTX{row.label.label_note ? ` · ${row.label.label_note}` : ''}</> : 'Mặc định'}
                  {row.needs_label_check && <><br /><span className={styles.check}>{NEEDS_LABEL_CHECK_TEXT}</span></>}
                </td>
                <td className={styles.actions}>
                  <Button size="sm" variant="secondary" aria-label={`Cập nhật theo nhãn ${row.trade_name}`} onClick={() => open(row)}>Cập nhật theo nhãn</Button>
                  {row.label && <Button size="sm" variant="secondary" aria-label={`Gỡ nhãn ${row.trade_name}`} onClick={() => removeLabel(row)}>Gỡ nhãn</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title={editing ? `Cập nhật theo nhãn: ${editing.trade_name}` : ''} size="sm">
        <p>Nhập đúng số ngày cách ly ghi trên nhãn của lô thuốc đang có ở kho HTX.</p>
        <label className={styles.field}>Số ngày cách ly
          <input className={styles.input} type="number" min={1} max={365} value={days} onChange={e => { setDays(e.target.value); setConfirmLow(false) }} />
        </label>
        <label className={styles.field}>Ghi chú nhãn (số lô, mô tả){below ? ' *' : ''}
          <input className={styles.input} maxLength={200} value={note} onChange={e => setNote(e.target.value)} />
        </label>
        {confirmLow && editing && <p role="alert" className={styles.error}>Thấp hơn mức sàn mặc định {editing.default_phi_days} ngày. Xác nhận đúng như nhãn?</p>}
        {formError && <p role="alert" className={styles.error}>{formError}</p>}
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => setEditing(null)}>Hủy</Button>
          <Button isLoading={busy} onClick={save}>{confirmLow ? 'Xác nhận đúng như nhãn' : 'Lưu'}</Button>
        </div>
      </Modal>
    </div>
  )
}
