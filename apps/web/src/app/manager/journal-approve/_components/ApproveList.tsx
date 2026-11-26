// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { Check, CheckCircle2, CheckSquare } from 'lucide-react'
import { EmptyState, PageHeader } from '@/components/ui'
import table from '@/components/features/dashboard/dashboard.module.css'
import kit from '@/components/features/dashboard/page-kit.module.css'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'

interface JournalEntry {
  id: string
  entry_date: string
  activity_type: string
  performed_by: string
  notes: string | null
  activities: { activity_detail: string; product_name: string | null }[]
}

const ACTIVITY_LABELS: Record<string, string> = {
  SOWING: 'Gieo sạ',
  FERTILIZING: 'Bón phân',
  SPRAYING: 'Phun thuốc',
  IRRIGATION: 'Tưới tiêu',
  HARVEST: 'Thu hoạch',
  OTHER: 'Khác',
}

function formatDetail(detail: string | null | undefined, notes: string | null): string {
  const text = detail || notes
  if (!text) return '—'
  
  if (ACTIVITY_LABELS[text]) return ACTIVITY_LABELS[text]
  
  for (const [key, label] of Object.entries(ACTIVITY_LABELS)) {
    if (text.startsWith(`${key}: `)) {
      return text.replace(`${key}: `, `${label}: `)
    }
  }
  return text
}

export function ApproveList() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [approving, setApproving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchEntries = useCallback(() => {
    setLoading(true)
    fetchJson<{ data?: JournalEntry[] }>('/api/journal?status=PENDING_APPROVAL')
      .then(j => { setEntries(j.data || []); setLoadFailed(false) })
      .catch(() => { setEntries([]); setLoadFailed(true) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === entries.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(entries.map(e => e.id)))
    }
  }

  async function handleApprove() {
    if (selected.size === 0) return
    setApproving(true)
    setMessage(null)

    try {
      const res = await fetch('/api/journal/batch-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_ids: Array.from(selected) }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error?.message || 'Lỗi duyệt nhật ký')
      }
      const data = await res.json()
      const { approved_count, failed_ids } = data.data
      setMessage({
        type: 'success',
        text: `Đã duyệt ${approved_count} nhật ký thành công.${failed_ids.length > 0 ? ` ${failed_ids.length} thất bại.` : ''}`,
      })
      setSelected(new Set())
      fetchEntries()
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Lỗi không xác định' })
    } finally {
      setApproving(false)
    }
  }

  return (
    <div className={kit.page}>
      <PageHeader
        icon={<CheckSquare size={28} />}
        title="Duyệt nhật ký"
        description="Nhật ký canh tác đang chờ Trưởng HTX phê duyệt"
        actions={
          <button
            type="button"
            className={kit.primary}
            disabled={selected.size === 0 || approving}
            onClick={handleApprove}
          >
            {approving ? 'Đang duyệt...' : (
              <>
                <Check size={16} aria-hidden="true" />
                Duyệt ({selected.size})
              </>
            )}
          </button>
        }
      />

      {message && (
        <p className={message.type === 'success' ? kit.success : kit.error} role="status">
          {message.text}
        </p>
      )}

      <div className={kit.card}>
        {loading ? (
          <div className={kit.state}>Đang tải...</div>
        ) : loadFailed ? (
          <div className={kit.state}>{LOAD_FAILED_MESSAGE}</div>
        ) : entries.length === 0 ? (
          <EmptyState icon={<CheckCircle2 size={28} />} title="Không có nhật ký nào đang chờ duyệt!" />
        ) : (
          <>
            <div className={table.tableWrap}>
              <table className={table.table}>
                <thead>
                  <tr>
                    <th className={kit.checkCell}>
                      <input
                        type="checkbox"
                        aria-label={`Chọn tất cả (${entries.length})`}
                        checked={selected.size === entries.length}
                        onChange={toggleAll}
                      />
                    </th>
                    <th>STT</th>
                    <th>Ngày</th>
                    <th>Hoạt động</th>
                    <th>Người thực hiện</th>
                    <th>Chi tiết</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, index) => (
                    <tr key={e.id}>
                      <td className={kit.checkCell}>
                        <input
                          type="checkbox"
                          aria-label={`Chọn nhật ký ${index + 1}`}
                          checked={selected.has(e.id)}
                          onChange={() => toggleSelect(e.id)}
                        />
                      </td>
                      <td>{index + 1}</td>
                      <td>{new Date(e.entry_date).toLocaleDateString('vi-VN')}</td>
                      <td>{ACTIVITY_LABELS[e.activity_type] || e.activity_type}</td>
                      <td>{e.performed_by}</td>
                      <td>{formatDetail(e.activities?.[0]?.activity_detail, e.notes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={kit.footer}>Đã chọn {selected.size} · Hiển thị {entries.length} nhật ký</div>
          </>
        )}
      </div>
    </div>
  )
}
