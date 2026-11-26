// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Pill } from '@/components/ui'
import layout from './dashboard.module.css'
import kit from './page-kit.module.css'

export interface PendingRow {
  id: string
  parcel: string
  household: string
  activity: string
  material: string
  date: string
}

/** The waiting journals on the dashboard, which the cooperative head can approve without leaving it. */
export function PendingJournals({ rows }: { rows: PendingRow[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const toggle = (id: string) => setSelected((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))

  async function approve() {
    setBusy(true)
    setMessage('')
    try {
      const res = await fetch('/api/journal/batch-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_ids: selected }),
      })
      if (!res.ok) throw new Error('approve')
      const { approved_count } = (await res.json()).data
      setMessage(`Đã duyệt ${approved_count} nhật ký.`)
      setSelected([])
      router.refresh()
    } catch {
      setMessage('Không duyệt được. Hãy thử lại.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className={kit.toolbar} style={{ justifyContent: 'flex-end' }}>
        <span role="status">{message}</span>
        <button type="button" className={kit.secondary} disabled={busy || selected.length === 0} onClick={approve}>
          Duyệt mục đã chọn{selected.length ? ` (${selected.length})` : ''}
        </button>
      </div>
      <div className={layout.tableWrap}>
        <table className={layout.table}>
          <thead>
            <tr>
              <th className={kit.checkCell}>
                <input type="checkbox" aria-label="Chọn tất cả" checked={selected.length === rows.length} onChange={() => setSelected(selected.length === rows.length ? [] : rows.map((r) => r.id))} />
              </th>
              <th>STT</th><th>Mã thửa</th><th>Nông hộ</th><th>Hoạt động</th><th>Vật tư</th><th>Ngày gửi</th><th>Trạng thái</th><th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, index) => (
              <tr key={r.id}>
                <td className={kit.checkCell}><input type="checkbox" aria-label={`Chọn nhật ký ${index + 1}`} checked={selected.includes(r.id)} onChange={() => toggle(r.id)} /></td>
                <td>{index + 1}</td>
                <td className={layout.code}>{r.parcel}</td>
                <td>{r.household}</td>
                <td>{r.activity}</td>
                <td>{r.material}</td>
                <td>{r.date}</td>
                <td><Pill tone="amber">Chờ duyệt</Pill></td>
                <td><Link href="/manager/journal-approve" className={layout.action}>Xử lý</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
