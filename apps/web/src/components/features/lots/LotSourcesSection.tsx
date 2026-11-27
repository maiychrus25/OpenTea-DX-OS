// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { DRY_TEA_GRADE_LABELS, type DryTeaGrade } from '@/domain/processing/grades'
import type { LotTraceData } from '@/domain/entities/lot-trace-data'
import { dayMonthYear } from '@/lib/weighing/format'
import styles from './lots.module.css'

const KIND_LABELS: Record<string, string> = { VIETGAP: 'VietGAP', OCOP: 'OCOP', ORGANIC: 'Hữu cơ', OTHER: 'Khác' }
const kg = (value: number) => value.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/**
 * The batch sources and certificates of a lot, for the manager's lot page. Works on snapshots from before phase 2:
 * missing lists read as empty. Plain markup, so it renders on the server.
 */
export function LotSourcesSection({ trace }: { trace: LotTraceData }) {
  const batches = trace.batches ?? []
  const certificates = trace.certificates ?? []

  return (
    <section aria-labelledby="lot-sources-title">
      <h3 id="lot-sources-title">Nguồn của lô</h3>

      <h4>Mẻ sao sấy</h4>
      {batches.length === 0 ? (
        <p className={styles.note}>Lô này chưa có nguồn từ mẻ sao sấy.</p>
      ) : (
        <ul className={styles.sourceList}>
          {batches.map(b => (
            <li key={b.batch_code}>
              <strong>{b.batch_code}</strong> · {dayMonthYear(b.processed_on)} · {DRY_TEA_GRADE_LABELS[b.grade as DryTeaGrade] ?? b.grade} · {kg(b.kg_in_lot)} kg trong lô
              {b.out_of_band ? <span className={styles.outBand}> Lệch chuẩn</span> : null}
            </li>
          ))}
        </ul>
      )}

      <h4>Chứng nhận</h4>
      {certificates.length === 0 ? (
        <p className={styles.note}>Lô này chưa gắn chứng nhận nào.</p>
      ) : (
        <ul className={styles.sourceList}>
          {certificates.map(c => (
            <li key={c.id}>
              <strong>{KIND_LABELS[c.kind] ?? c.kind} · {c.number}</strong> · {c.issuer} · hết hạn {dayMonthYear(c.expires_on)}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
