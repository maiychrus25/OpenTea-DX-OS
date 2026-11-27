// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

interface Props {
  parcelId: string
  parcelCode: string
  /** The flush label shown in the confirmation, e.g. the season. */
  cycleLabel?: string | null
  canApprove: boolean
  safeHarvestDate?: string | null
  onDone?: () => void
}

const ddMMyyyy = (value: string) => new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })

/** Days left until the safe date, counted in whole calendar days from today. */
function daysLeft(value: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const safe = new Date(value); safe.setHours(0, 0, 0, 0)
  return Math.max(1, Math.round((safe.getTime() - today.getTime()) / 86_400_000))
}

export function ApproveHarvestButton({ parcelId, parcelCode, cycleLabel, canApprove, safeHarvestDate, onDone }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  async function approve() {
    setBusy(true)
    try {
      const res = await fetch(`/api/parcels/${parcelId}/approve-harvest`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (res.ok) {
        setResult({ ok: true, text: `Đã nghiệm thu nương ${parcelCode}.` })
        onDone?.()
      } else {
        setResult({ ok: false, text: body?.error?.message || 'Không nghiệm thu được. Vui lòng thử lại.' })
      }
    } catch {
      setResult({ ok: false, text: 'Lỗi kết nối máy chủ.' })
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }

  return (
    <div>
      <Button size="sm" disabled={!canApprove || busy} onClick={() => { setResult(null); setOpen(true) }}>Nghiệm thu đạt cách ly</Button>
      {!canApprove && safeHarvestDate && (
        <p role="note">Còn {daysLeft(safeHarvestDate)} ngày cách ly (an toàn từ {ddMMyyyy(safeHarvestDate)})</p>
      )}
      {result && <p role={result.ok ? 'status' : 'alert'}>{result.text}</p>}
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Nghiệm thu đạt cách ly" size="sm">
        <p>Xác nhận nương {parcelCode}, lứa {cycleLabel || 'đang mở'} đã qua thời gian cách ly và được phép thu hái?</p>
        <div>
          <Button variant="secondary" onClick={() => setOpen(false)}>Hủy</Button>
          <Button isLoading={busy} onClick={approve}>Xác nhận</Button>
        </div>
      </Modal>
    </div>
  )
}
