// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import kit from '@/components/features/farmer-web/kit.module.css'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import type { CertificateView } from '@/lib/certificates/types'
import { processingErrorText } from '@/lib/processing/errors'
import { dayMonthYear } from '@/lib/weighing/format'
import styles from './lots.module.css'

const KIND_LABELS: Record<CertificateView['kind'], string> = { VIETGAP: 'VietGAP', OCOP: 'OCOP', ORGANIC: 'Hữu cơ', OTHER: 'Khác' }

function statusText(c: CertificateView): string {
  if (c.status === 'REVOKED') return 'Đã thu hồi'
  if (c.status === 'EXPIRED') return 'Đã hết hạn'
  return `Còn hiệu lực đến ${dayMonthYear(c.expires_on)}`
}

interface Props {
  lotId: string
  lotCode: string
  onCancel: () => void
  onExported: (lotCode: string) => void
}

/** Export step: lists the cooperative's certificates; the valid ones are checked by default. */
export function ExportQrDialog({ lotId, lotCode, onCancel, onExported }: Props) {
  const [certificates, setCertificates] = useState<CertificateView[] | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchJson<{ data: CertificateView[] }>('/api/certificates')
      .then(body => {
        setCertificates(body.data)
        setPicked(body.data.filter(c => c.status === 'VALID').map(c => c.id))
      })
      .catch(() => setLoadError(LOAD_FAILED_MESSAGE))
  }, [])

  async function confirm() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/lots/${lotId}/export-qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certificate_ids: picked }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(processingErrorText(json?.error?.code, json?.error?.message, 'Không xuất được QR. Vui lòng thử lại.')); return }
      onExported(json.data?.lot_code ?? lotCode)
    } catch {
      setError('Lỗi kết nối máy chủ.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal isOpen onClose={onCancel} title={`Xuất QR cho lô ${lotCode}`} size="md">
      {loadError && <p role="alert" className={styles.error}>{loadError}</p>}
      {certificates && certificates.length === 0 && (
        <p className={kit.muted}>HTX chưa có chứng nhận nào. Lô vẫn xuất QR, không kèm chứng nhận.</p>
      )}
      {certificates && certificates.length > 0 && (
        <>
          <p>Chọn chứng nhận gắn vào lô. Chứng nhận đã hết hạn hoặc đã thu hồi không chọn được.</p>
          <ul className={kit.list} aria-label="Chứng nhận">
            {certificates.map(c => (
              <li key={c.id} className={styles.checkRow}>
                <label className={styles.checkLabel}>
                  <input type="checkbox" checked={picked.includes(c.id)} disabled={c.status !== 'VALID' || busy}
                    onChange={e => setPicked(prev => e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id))} />
                  <span><strong>{KIND_LABELS[c.kind]} · {c.number}</strong> <span className={kit.muted}>{c.issuer} · {statusText(c)}</span></span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onCancel}>Hủy</Button>
        <Button isLoading={busy} disabled={!certificates} onClick={confirm}>Xuất QR</Button>
      </div>
    </Modal>
  )
}
