// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { Check, Info, Lock, ShieldCheck, X } from 'lucide-react'
import type { LotTraceData } from '@/domain/entities/lot-trace-data'
import { DRY_TEA_GRADE_LABELS, RECOVERY_BAND, type DryTeaGrade } from '@/domain/processing/grades'
import { BRAND_NAME } from '@/lib/brand'
import { dayMonthYear } from '@/lib/weighing/format'
import styles from './public-trace.module.css'

export type CertificateState = 'VALID' | 'EXPIRED' | 'REVOKED'

const ACTIVITY_LABELS: Record<string, string> = {
  SOWING: 'Trồng mới',
  FERTILIZING: 'Bón phân',
  SPRAYING: 'Phun thuốc',
  IRRIGATION: 'Tưới tiêu',
  HARVEST: 'Thu hoạch',
  PRUNING: 'Đốn chè',
  OTHER: 'Khác',
}
const KIND_LABELS: Record<string, string> = { VIETGAP: 'VietGAP', OCOP: 'OCOP', ORGANIC: 'Hữu cơ', OTHER: 'Khác' }
const kg = (value: number) => value.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const ratio = (value: number) => value.toFixed(2).replace('.', ',')
/** Date-only strings (Vietnam days) and Date objects both print as dd/MM/yyyy in Vietnam time. */
const dayText = (value: string | Date) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  ? dayMonthYear(value)
  : new Date(value).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }))

function certificateWords(state: CertificateState, expiresOn: string): string {
  if (state === 'REVOKED') return 'Đã thu hồi'
  if (state === 'EXPIRED') return 'Đã hết hạn'
  return `Còn hiệu lực đến ${dayMonthYear(expiresOn)}`
}

interface Props {
  trace: LotTraceData
  verification: string[]
  /** Validity of each certificate at view time (phase 2 B1 rule, supplied by the page). */
  certificateState: (c: NonNullable<LotTraceData['certificates']>[number]) => CertificateState
}

/** The public trace page: four layers in order (origin, safety, processing batch, certificates); empty layers are left out. */
export function PublicTrace({ trace, verification, certificateState }: Props) {
  const batches = trace.batches ?? []
  const intake = trace.intake ?? []
  const certificates = trace.certificates ?? []
  const gradeLabel = trace.dry_grade && trace.dry_grade in DRY_TEA_GRADE_LABELS ? DRY_TEA_GRADE_LABELS[trace.dry_grade as DryTeaGrade] : null
  const lotKg = trace.total_weight_kg ?? batches.reduce((sum, b) => sum + b.kg_in_lot, 0)
  const showOrigin = trace.parcels.length > 0 || !!trace.htx_name
  const showSafety = intake.length > 0 || trace.journal_summaries.length > 0
  const showBatches = batches.length > 0
  const showCertificates = certificates.length > 0 || (trace.certificate_keys?.length ?? 0) > 0

  return (
    <article className={styles.page}>
      {trace.status === 'QR_EXPORTED' && (
        <p className={styles.locked}><Lock size={16} aria-hidden="true" /> Thông tin đã được xác nhận và khoá từ khi xuất QR.</p>
      )}
      <header className={styles.head}>
        <p className={styles.brand}>{BRAND_NAME} · Truy xuất nguồn gốc</p>
        <h1 className={styles.title}>{trace.commodity}{gradeLabel ? ` · ${gradeLabel}` : ''}</h1>
        <p className={styles.code}>Mã lô {trace.lot_code}</p>
        {trace.total_weight_kg !== null && <p className={styles.muted}>Khối lượng {kg(trace.total_weight_kg)} kg</p>}
      </header>

      {verification.length > 0 && (
        <section className={styles.verified} aria-label="Kiểm chứng trong sổ audit">
          <ShieldCheck size={20} aria-hidden="true" />
          <ul className={styles.plainList}>
            {verification.map((line, index) => <li key={index}>{line}</li>)}
          </ul>
        </section>
      )}

      {showOrigin && (
        <section className={styles.layer} aria-labelledby="layer-origin">
          <h2 id="layer-origin" className={styles.layerTitle}>1. Vùng trồng</h2>
          {trace.htx_name && <p><strong>Hợp tác xã:</strong> {trace.htx_name}</p>}
          <ul className={styles.plainList}>
            {trace.parcels.map((p, i) => (
              <li key={`${p.parcel_code}-${i}`}>
                Thửa {p.parcel_code} · {p.area_ha} ha{p.crop_type ? ` · ${p.crop_type}` : ''}
                {p.household_name ? <span className={styles.muted}> · Hộ {p.household_name}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      {showSafety && (
        <section className={styles.layer} aria-labelledby="layer-safety">
          <h2 id="layer-safety" className={styles.layerTitle}>2. An toàn cách ly</h2>
          <p className={trace.is_harvest_safe ? styles.pass : styles.fail}>
            {trace.is_harvest_safe ? <Check size={16} aria-hidden="true" /> : <X size={16} aria-hidden="true" />}
            {trace.is_harvest_safe ? ' Đạt: mọi phiếu cân nguồn đã qua ngày an toàn.' : ' Chưa đạt: có phiếu cân nguồn còn trong thời gian cách ly.'}
          </p>
          {intake.length > 0 && (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead><tr><th>Thửa</th><th>Lứa</th><th>Ngày cân</th><th>Kg tịnh</th><th>Ngày an toàn</th></tr></thead>
                <tbody>
                  {intake.map((row, i) => (
                    <tr key={`${row.parcel_code}-${row.weighed_on}-${i}`}>
                      <td>{row.parcel_code}</td>
                      <td>{row.cycle_label ?? '—'}</td>
                      <td>{dayMonthYear(row.weighed_on)}</td>
                      <td>{kg(row.net_kg)}</td>
                      <td>{row.safe_on ? dayMonthYear(row.safe_on) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {trace.journal_summaries.length > 0 && (
            <ol className={styles.timeline}>
              {trace.journal_summaries.map((j, i) => (
                <li key={`${dayText(j.entry_date)}-${j.activity_type}-${i}`}>
                  <span className={styles.timelineDate}>{dayText(j.entry_date)}</span>
                  <span><strong>{ACTIVITY_LABELS[j.activity_type] ?? j.activity_type}</strong>
                    {j.product_name ? ` · ${j.product_name}` : ''}{j.dosage ? ` (${j.dosage})` : ''}
                    {j.withdrawal_days !== null && j.withdrawal_days > 0 ? ` · cách ly ${j.withdrawal_days} ngày` : ''}</span>
                  {j.performed_by ? <span className={styles.muted}>Thực hiện bởi {j.performed_by}</span> : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {showBatches && (
        <section className={styles.layer} aria-labelledby="layer-batches">
          <h2 id="layer-batches" className={styles.layerTitle}>3. Mẻ sao chế biến</h2>
          <p>
            Lô {kg(lotKg)} kg{gradeLabel ? ` hạng ${gradeLabel}` : ''} lấy từ {batches.length} mẻ, {intake.length} phiếu cân.
          </p>
          <ul className={styles.plainList}>
            {batches.map(b => {
              const outOfBand = b.out_of_band
              return (
                <li key={b.batch_code} className={styles.batch}>
                  <strong>{b.batch_code}</strong> · {dayMonthYear(b.processed_on)}
                  <span>{kg(b.fresh_kg)} kg búp tươi → {kg(b.dry_kg)} kg chè khô</span>
                  <span className={outOfBand ? styles.fail : styles.pass}>
                    Tỷ lệ {ratio(b.recovery_ratio)} : 1{outOfBand ? ` (ngoài khoảng ${RECOVERY_BAND.min.toFixed(2).replace('.', ',')}–${RECOVERY_BAND.max.toFixed(2).replace('.', ',')}, có giải trình)` : ''}
                  </span>
                  <span className={styles.muted}>{kg(b.kg_in_lot)} kg vào lô{b.master_name ? ` · Nghệ nhân ${b.master_name}` : ''}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {showCertificates && (
        <section className={styles.layer} aria-labelledby="layer-certificates">
          <h2 id="layer-certificates" className={styles.layerTitle}>4. Chứng nhận</h2>
          {certificates.length > 0 ? (
            <ul className={styles.plainList}>
              {certificates.map(c => {
                const state = certificateState(c)
                return (
                  <li key={c.id} className={styles.certificate}>
                    <strong>{KIND_LABELS[c.kind] ?? c.kind} · {c.number}</strong>
                    <span>{c.issuer} · <span className={state === 'VALID' ? styles.pass : styles.fail}>{certificateWords(state, c.expires_on)}</span></span>
                    <a className={styles.link} href={`/api/lot/${encodeURIComponent(trace.lot_code)}/certificate?key=${encodeURIComponent(c.file_key)}`} target="_blank" rel="noopener noreferrer">Xem tệp chứng nhận</a>
                  </li>
                )
              })}
            </ul>
          ) : (
            // Snapshots from before phase 2 carry only the file keys.
            <ul className={styles.plainList}>
              {(trace.certificate_keys ?? []).map((key, i) => (
                <li key={key}>
                  <a className={styles.link} href={`/api/lot/${encodeURIComponent(trace.lot_code)}/certificate?key=${encodeURIComponent(key)}`} target="_blank" rel="noopener noreferrer">Xem giấy chứng nhận {i + 1}</a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <p className={styles.disclaimer}><Info size={14} aria-hidden="true" /> {BRAND_NAME} không chỉnh sửa hoặc xác nhận thay cho cán bộ kỹ thuật. Thông tin được ghi nhận bởi cán bộ kỹ thuật được phân công.</p>
    </article>
  )
}
