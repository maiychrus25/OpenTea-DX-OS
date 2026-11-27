// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import QRCode from 'qrcode'
import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import kit from '@/components/features/farmer-web/kit.module.css'
import { DRY_TEA_GRADE_LABELS, type DryTeaGrade } from '@/domain/processing/grades'
import styles from './labels.module.css'

export const LABEL_PRESETS = [
  { id: '50x30', width: 50, height: 30, label: '50 × 30 mm', className: 'size50x30' },
  { id: '40x30', width: 40, height: 30, label: '40 × 30 mm', className: 'size40x30' },
  { id: '60x40', width: 60, height: 40, label: '60 × 40 mm', className: 'size60x40' },
] as const

const MAX_COPIES = 500

interface Props {
  lotCode: string
  weightKg: number | null
  dryGrade: string | null
  htxName: string | null
}

/** Label sheet for a lot: a QR to /q/<lot code>, the lot code, the grade, the weight and the cooperative. */
export function LotLabelSheet({ lotCode, weightKg, dryGrade, htxName }: Props) {
  const [presetId, setPresetId] = useState<(typeof LABEL_PRESETS)[number]['id']>('50x30')
  const [copiesText, setCopiesText] = useState('1')
  const [qr, setQr] = useState<string | null>(null)
  const preset = LABEL_PRESETS.find(p => p.id === presetId) ?? LABEL_PRESETS[0]
  const copies = /^\d{1,3}$/.test(copiesText) ? Number(copiesText) : 0
  const copiesValid = copies >= 1 && copies <= MAX_COPIES
  const gradeText = dryGrade && dryGrade in DRY_TEA_GRADE_LABELS ? `Chè ${DRY_TEA_GRADE_LABELS[dryGrade as DryTeaGrade]}` : 'Chè'

  useEffect(() => {
    let live = true
    // The QR points at the one public page; the origin is the page's own, so the printed code follows the deployment.
    QRCode.toDataURL(`${window.location.origin}/q/${encodeURIComponent(lotCode)}`, { margin: 0, width: 240 })
      .then(url => { if (live) setQr(url) })
      .catch(() => { if (live) setQr(null) })
    return () => { live = false }
  }, [lotCode])

  return (
    <div className={kit.pn}>
      <div className={styles.controls}>
        <label className={kit.fl}>
          Khổ tem
          <select className={kit.inp} value={presetId} onChange={e => setPresetId(e.target.value as typeof presetId)}>
            {LABEL_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <label className={kit.fl}>
          Số tem (1 đến 500)
          <input className={kit.inp} type="number" inputMode="numeric" min={1} max={MAX_COPIES} step={1} value={copiesText}
            aria-invalid={!copiesValid} onChange={e => setCopiesText(e.target.value)} />
        </label>
        <Button disabled={!copiesValid || !qr} onClick={() => window.print()}>In tem</Button>
      </div>
      {!copiesValid && <p role="alert" className={styles.error}>Nhập số tem từ 1 đến 500.</p>}
      {!qr && <p className={kit.muted}>Đang tạo mã QR...</p>}

      <div className={styles.printArea}>
        {copiesValid && qr && Array.from({ length: copies }, (_, index) => (
          <div key={index} className={`${styles.label} ${styles[preset.className]}`}>
            {/* The QR is a data URL built in this page; next/image cannot optimise it. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.qr} src={qr} alt={`Mã QR lô ${lotCode}`} />
            <div className={styles.text}>
              <strong>{lotCode}</strong>
              <span>{gradeText}</span>
              {weightKg !== null && <span>{weightKg.toLocaleString('vi-VN')} kg</span>}
              {htxName && <span>{htxName}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
