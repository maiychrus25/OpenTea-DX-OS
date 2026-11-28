// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import table from '@/components/features/dashboard/dashboard.module.css'
import kit from '@/components/features/dashboard/page-kit.module.css'
import type { PesticideRow } from '@/lib/platform-pesticides'
import styles from './platform.module.css'

export function PesticideTable({ initialRows }: { initialRows: PesticideRow[] }) {
  const [rows, setRows] = useState(initialRows)
  const [busy, setBusy] = useState<string | null>(null)

  const patch = (id: string, change: Partial<PesticideRow>) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...change } : r)))

  const save = async (row: PesticideRow) => {
    setBusy(row.id)
    try {
      const res = await fetch(`/api/platform/pesticides/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_phi_days: row.default_phi_days, phi_needs_label_check: row.phi_needs_label_check, active: row.active }),
      })
      if (!res.ok) throw new Error()
      toast.success(`Đã lưu ${row.trade_name}`)
    } catch {
      toast.error('Không lưu được. Số ngày cách ly phải từ 1 đến 365.')
    } finally {
      setBusy(null)
    }
  }

  if (rows.length === 0) return <div className={kit.card}><div className={kit.state}>Danh mục thuốc chưa có dữ liệu.</div></div>

  return (
    <div className={kit.card}>
      <div className={table.tableWrap}>
        <table className={table.table}>
          <thead>
            <tr>
              <th scope="col">Tên thuốc</th>
              <th scope="col">Hoạt chất</th>
              <th scope="col">Ngày cách ly (sàn)</th>
              <th scope="col">Cần đối chiếu nhãn</th>
              <th scope="col">Đang dùng</th>
              <th scope="col">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.trade_name}</td>
                <td>{row.active_ingredient}</td>
                <td>
                  <input
                    type="number" min={1} max={365} step={1}
                    className={styles.days}
                    aria-label={`Ngày cách ly của ${row.trade_name}`}
                    value={row.default_phi_days}
                    onChange={(e) => patch(row.id, { default_phi_days: Number(e.target.value) })}
                  />
                </td>
                <td><input type="checkbox" aria-label={`Cần đối chiếu nhãn: ${row.trade_name}`} checked={row.phi_needs_label_check} onChange={(e) => patch(row.id, { phi_needs_label_check: e.target.checked })} /></td>
                <td><input type="checkbox" aria-label={`Đang dùng: ${row.trade_name}`} checked={row.active} onChange={(e) => patch(row.id, { active: e.target.checked })} /></td>
                <td><button type="button" className={kit.primary} disabled={busy === row.id} onClick={() => save(row)}>Lưu</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
