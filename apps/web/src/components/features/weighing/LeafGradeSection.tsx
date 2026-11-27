// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import kit from '@/components/features/farmer-web/kit.module.css'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import styles from './weighing.module.css'

export interface LeafGrade {
  id: string
  name: string
  sort_order: number
  active: boolean
}

const NAME_REQUIRED_MESSAGE = 'Nhập tên phẩm cấp (tối đa 60 ký tự).'

interface Props {
  onChanged: () => void
}

export function LeafGradeSection({ onChanged }: Props) {
  const [grades, setGrades] = useState<LeafGrade[]>([])
  const [loadError, setLoadError] = useState('')
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => fetchJson<{ data: LeafGrade[] }>('/api/leaf-grades')
    .then(body => { setGrades(body.data); setLoadError('') })
    .catch(() => setLoadError(LOAD_FAILED_MESSAGE))

  useEffect(() => { void load() }, [])

  /** Sends one change and, when it lands, reloads the grades and tells the price board. */
  async function send(url: string, init: { method: string; body: object }, fallback: string) {
    setBusy(true)
    setFormError('')
    try {
      const res = await fetch(url, { method: init.method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(init.body) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setFormError(body?.error?.message || fallback); return false }
      await load()
      onChanged()
      return true
    } catch {
      setFormError('Lỗi kết nối máy chủ.')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function addGrade() {
    const name = newName.trim()
    if (name.length < 1 || name.length > 60) { setFormError(NAME_REQUIRED_MESSAGE); return }
    if (await send('/api/leaf-grades', { method: 'POST', body: { name } }, 'Không thêm được phẩm cấp.')) setNewName('')
  }

  async function renameGrade(id: string) {
    const name = editName.trim()
    if (name.length < 1 || name.length > 60) { setFormError(NAME_REQUIRED_MESSAGE); return }
    if (await send(`/api/leaf-grades/${id}`, { method: 'PUT', body: { name } }, 'Không đổi được tên.')) setEditingId(null)
  }

  const setActive = (id: string, active: boolean) =>
    send(`/api/leaf-grades/${id}`, { method: 'PUT', body: { active } }, active ? 'Không hiện lại được phẩm cấp.' : 'Không ẩn được phẩm cấp.')

  return (
    <section className={kit.pn} aria-labelledby="leaf-grade-title">
      <div className={kit.ph}><h2 id="leaf-grade-title">Phẩm cấp búp</h2></div>
      {loadError && <p role="alert" className={`${styles.error} ${styles.pad}`}>{loadError}</p>}
      <ul className={kit.list}>
        {grades.map(g => (
          <li key={g.id} className={styles.gradeRow}>
            {editingId === g.id ? (
              <>
                <label className={`${kit.fl} ${styles.grow}`}>
                  Tên phẩm cấp
                  <input className={kit.inp} maxLength={60} value={editName} onChange={e => setEditName(e.target.value)} />
                </label>
                <div className={styles.rowActions}>
                  <Button size="sm" isLoading={busy} onClick={() => renameGrade(g.id)}>Lưu</Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditingId(null)}>Hủy</Button>
                </div>
              </>
            ) : (
              <>
                <div className={styles.grow}>
                  <strong>{g.name}</strong>{' '}
                  <span className={kit.muted}>{g.active ? '' : '(đã ẩn)'}</span>
                </div>
                <div className={styles.rowActions}>
                  <Button size="sm" variant="secondary" aria-label={`Đổi tên ${g.name}`} disabled={busy}
                    onClick={() => { setEditingId(g.id); setEditName(g.name); setFormError('') }}>Đổi tên</Button>
                  <Button size="sm" variant="secondary" aria-label={`${g.active ? 'Ẩn' : 'Hiện lại'} ${g.name}`} disabled={busy}
                    onClick={() => setActive(g.id, !g.active)}>{g.active ? 'Ẩn' : 'Hiện lại'}</Button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className={styles.addRow}>
        <label className={`${kit.fl} ${styles.grow}`}>
          Tên phẩm cấp mới
          <input className={kit.inp} maxLength={60} value={newName} placeholder="VD: Loại 4" onChange={e => setNewName(e.target.value)} />
        </label>
        <Button variant="secondary" isLoading={busy} onClick={addGrade}>Thêm phẩm cấp</Button>
      </div>
      {formError && <p role="alert" className={`${styles.error} ${styles.pad}`}>{formError}</p>}
    </section>
  )
}
