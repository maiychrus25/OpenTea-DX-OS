// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import Link from 'next/link'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import kit from '@/components/features/farmer-web/kit.module.css'
import { localDay } from '@/domain/shared/local-day'
import { DRY_TEA_GRADES, DRY_TEA_GRADE_LABELS, RECOVERY_BAND, type DryTeaGrade } from '@/domain/processing/grades'
import { processingErrorText } from '@/lib/processing/errors'
import type { BatchDetail } from '@/lib/processing/types'
import type { LeafTicket } from '@/lib/weighing/types'
import { dayMonthYear } from '@/lib/weighing/format'
import styles from './processing.module.css'

const MIN_NOTE = 10
const MIN_REASON = 3
const MAX_TEXT = 200
const kg = (value: number) => value.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const ratioText = (value: number) => `${value.toFixed(2).replace('.', ',')} : 1`
const BAND_TEXT = `${RECOVERY_BAND.min.toFixed(2).replace('.', ',')}–${RECOVERY_BAND.max.toFixed(2).replace('.', ',')} : 1`
/** Whole-day window for the ticket picker: the last 30 days, Vietnam days. */
const daysAgo = (days: number) => localDay(new Date(Date.now() - days * 86400000))

/** Positive kg with at most one decimal, up to 100000. */
const parseOutputKg = (text: string) => (/^\d{1,6}(\.\d)?$/.test(text) && Number(text) > 0 && Number(text) <= 100000 ? Number(text) : null)

interface Props {
  batchId: string
  /** The list page, for the back link. */
  listHref: string
}

/** One processing batch: its tickets, outputs, live recovery band, finish (with the deviation note) and cancel. */
export function BatchDetailView({ batchId, listHref }: Props) {
  const [detail, setDetail] = useState<BatchDetail | null>(null)
  const [missing, setMissing] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const [available, setAvailable] = useState<LeafTicket[] | null>(null)
  const [from, setFrom] = useState(daysAgo(30))
  const [to, setTo] = useState(localDay(new Date()))
  const [picked, setPicked] = useState<string[]>([])

  const [outputDraft, setOutputDraft] = useState<Record<DryTeaGrade, string>>({ DINH: '', TOM_NON: '', MOC_CAU: '', BOM: '', CAM: '' })
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState('')
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const draftSeeded = useRef(false)
  const [reason, setReason] = useState('')

  const loadDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/processing-batches/${batchId}`)
      if (res.status === 404) { setMissing(true); return }
      if (!res.ok) throw new Error('load')
      const body = await res.json()
      setDetail(body.data)
      setLoadError('')
      // Seed the output boxes once, so a reload after a ticket change does not wipe typing that is not saved yet.
      if (!draftSeeded.current) {
        draftSeeded.current = true
        setOutputDraft(() => {
          const next = { DINH: '', TOM_NON: '', MOC_CAU: '', BOM: '', CAM: '' } as Record<DryTeaGrade, string>
          for (const grade of DRY_TEA_GRADES) {
            const row = body.data.outputs.find((o: { grade: DryTeaGrade; kg: number }) => o.grade === grade)
            next[grade] = row ? String(row.kg) : ''
          }
          return next
        })
      }
    } catch {
      setLoadError('Không tải được mẻ. Vui lòng thử lại sau.')
    }
  }, [batchId])

  useEffect(() => { void loadDetail() }, [loadDetail])

  async function loadAvailable() {
    try {
      const res = await fetch(`/api/processing-batches/available-tickets?from=${from}&to=${to}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(processingErrorText(body?.error?.code, body?.error?.message, 'Không tải được phiếu cân.')); return }
      setAvailable(body.data)
      setPicked(prev => prev.filter(id => (body.data as LeafTicket[]).some(t => t.id === id)))
    } catch {
      setError('Lỗi kết nối máy chủ.')
    }
  }

  /** Runs a mutation, shows its error by code, and reloads the batch on success. */
  async function act(url: string, method: 'POST' | 'PUT' | 'DELETE', body: object | null, done: string, fallback: string) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(processingErrorText(json?.error?.code, json?.error?.message, fallback))
        if (json?.error?.code === 'TICKETS_CHANGED') void loadAvailable()
        return false
      }
      setNotice(done)
      await loadDetail()
      return true
    } catch {
      setError('Lỗi kết nối máy chủ.')
      return false
    } finally {
      setBusy(false)
    }
  }

  if (missing) return <p role="alert" className={styles.error}>{processingErrorText('NOT_FOUND', undefined, 'Không tìm thấy mẻ này.')}</p>
  if (loadError) return <p role="alert" className={styles.error}>{loadError}</p>
  if (!detail) return <p className={kit.muted}>Đang tải mẻ...</p>

  const { batch, tickets, outputs, preview } = detail
  const open = batch.status === 'OPEN'
  const outOfBand = preview.out_of_band
  const pickedKg = (available ?? []).filter(t => picked.includes(t.id)).reduce((sum, t) => sum + Number(t.net_kg), 0)

  async function addPicked() {
    if (picked.length === 0) return
    const ok = await act(`/api/processing-batches/${batchId}/tickets`, 'POST', { ticket_ids: picked }, `Đã thêm ${picked.length} phiếu vào mẻ.`, 'Không thêm được phiếu vào mẻ.')
    if (ok) { setPicked([]); void loadAvailable() }
  }

  function saveOutputs() {
    const rows: { grade: DryTeaGrade; kg: number }[] = []
    for (const grade of DRY_TEA_GRADES) {
      const text = outputDraft[grade].trim()
      if (text === '') continue
      const value = parseOutputKg(text)
      if (value === null) { setError(`Nhập kg cho ${DRY_TEA_GRADE_LABELS[grade]}: lớn hơn 0, tối đa 100.000, một chữ số thập phân.`); return }
      rows.push({ grade, kg: value })
    }
    void act(`/api/processing-batches/${batchId}/outputs`, 'PUT', { outputs: rows }, 'Đã lưu sản lượng.', 'Không lưu được sản lượng.')
  }

  function finish() {
    const text = note.trim()
    if (outOfBand && text.length < MIN_NOTE) {
      setNoteError(`Tỷ lệ ${ratioText(preview.recovery_ratio ?? 0)} nằm ngoài khoảng chuẩn ${BAND_TEXT}. Nhập giải trình ít nhất ${MIN_NOTE} ký tự.`)
      noteRef.current?.focus()
      return
    }
    setNoteError('')
    void act(`/api/processing-batches/${batchId}/finish`, 'POST', text ? { deviation_note: text } : {}, 'Đã hoàn thành mẻ.', 'Không hoàn thành được mẻ.')
  }

  function cancel() {
    const text = reason.trim()
    if (text.length < MIN_REASON || text.length > MAX_TEXT) { setError(`Nhập lý do huỷ từ ${MIN_REASON} đến ${MAX_TEXT} ký tự.`); return }
    void act(`/api/processing-batches/${batchId}/cancel`, 'POST', { reason: text }, 'Đã huỷ mẻ.', 'Không huỷ được mẻ.')
  }

  return (
    <div className={styles.detailLayout}>
      <p><Link href={listHref} className={styles.link}>← Các mẻ sao sấy</Link></p>

      <section className={kit.pn} aria-labelledby="batch-head-title">
        <div className={kit.ph}>
          <h2 id="batch-head-title">{batch.batch_code}</h2>
          <span className={kit.tag}>{batch.status === 'OPEN' ? 'Đang mở' : batch.status === 'FINISHED' ? 'Đã hoàn thành' : 'Đã huỷ'}</span>
        </div>
        <p className={`${kit.muted} ${styles.pad}`}>
          Chế biến ngày {dayMonthYear(batch.processed_on)}
          {batch.master_name ? ` · Nghệ nhân: ${batch.master_name}` : ''}
          {batch.shift ? ` · Ca: ${batch.shift}` : ''}
        </p>
        {batch.notes && <p className={styles.pad}>{batch.notes}</p>}
        {batch.status === 'CANCELLED' && <p role="status" className={`${styles.pad} ${styles.error}`}>Đã huỷ: {batch.cancel_reason}</p>}
        {batch.status === 'FINISHED' && batch.deviation_note && <p className={styles.pad}>Giải trình lệch chuẩn: {batch.deviation_note}</p>}
      </section>

      <section className={kit.pn} aria-labelledby="ratio-title">
        <div className={kit.ph}><h2 id="ratio-title">Cân bằng khối lượng</h2></div>
        <dl className={`${styles.metrics} ${styles.pad}`}>
          <div><dt>Kg búp tươi tịnh</dt><dd>{kg(preview.fresh_kg)} kg</dd></div>
          <div><dt>Kg chè khô</dt><dd>{kg(preview.dry_kg)} kg</dd></div>
          <div><dt>Tỷ lệ tươi : khô</dt><dd>{preview.recovery_ratio === null ? '—' : ratioText(preview.recovery_ratio)}</dd></div>
        </dl>
        <p role="status" className={`${styles.light} ${styles.pad} ${preview.recovery_ratio === null ? styles.lightWait : outOfBand ? styles.lightBlock : styles.lightOk}`}>
          {preview.recovery_ratio === null
            ? 'Chưa có sản lượng để tính tỷ lệ.'
            : outOfBand ? `Lệch khoảng chuẩn ${BAND_TEXT}. Cần giải trình khi hoàn thành.` : `Trong khoảng chuẩn ${BAND_TEXT}.`}
        </p>
      </section>

      <section className={kit.pn} aria-labelledby="batch-tickets-title">
        <div className={kit.ph}><h2 id="batch-tickets-title">Phiếu cân trong mẻ ({tickets.length})</h2></div>
        {tickets.length === 0 && <p className={`${kit.muted} ${styles.pad}`}>Chưa có phiếu cân nào trong mẻ.</p>}
        <ul className={kit.list}>
          {tickets.map(t => (
            <li key={t.id} className={styles.row}>
              <div className={styles.grow}>
                <strong>{t.ticket_no}</strong>
                <span className={kit.muted}>{t.household_name} · {t.parcel_code} · {kg(Number(t.net_kg))} kg tịnh</span>
              </div>
              {open && <Button size="sm" variant="secondary" aria-label={`Bỏ ${t.ticket_no} khỏi mẻ`} disabled={busy}
                onClick={() => act(`/api/processing-batches/${batchId}/tickets/${t.id}`, 'DELETE', null, 'Đã bỏ phiếu khỏi mẻ.', 'Không bỏ được phiếu.')}>Bỏ khỏi mẻ</Button>}
            </li>
          ))}
        </ul>

        {open && (
          <div className={styles.pad}>
            <h3 className={styles.subhead}>Thêm phiếu cân</h3>
            <div className={styles.formGrid}>
              <label className={kit.fl}>Từ ngày<input className={kit.inp} type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
              <label className={kit.fl}>Đến ngày<input className={kit.inp} type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
            </div>
            <Button variant="secondary" onClick={loadAvailable}>Tải phiếu chọn được</Button>
            {available && available.length === 0 && <p className={kit.muted}>Không có phiếu nào chọn được trong khoảng ngày này.</p>}
            {available && available.length > 0 && (
              <>
                <ul className={kit.list} aria-label="Phiếu chọn được">
                  {available.map(t => (
                    <li key={t.id} className={styles.row}>
                      <label className={styles.checkRow}>
                        <input type="checkbox" checked={picked.includes(t.id)}
                          onChange={e => setPicked(prev => e.target.checked ? [...prev, t.id] : prev.filter(id => id !== t.id))} />
                        <span><strong>{t.ticket_no}</strong> <span className={kit.muted}>{t.household_name} · {t.parcel_code} · {kg(Number(t.net_kg))} kg</span></span>
                      </label>
                    </li>
                  ))}
                </ul>
                <p className={styles.pad}>Đã chọn {picked.length} phiếu, {kg(pickedKg)} kg tịnh.</p>
                <Button isLoading={busy} disabled={picked.length === 0 || picked.length > 200} onClick={addPicked}>Thêm {picked.length} phiếu vào mẻ</Button>
              </>
            )}
          </div>
        )}
      </section>

      <section className={kit.pn} aria-labelledby="outputs-title">
        <div className={kit.ph}><h2 id="outputs-title">Sản lượng chè khô</h2></div>
        {open ? (
          <div className={styles.pad}>
            <div className={styles.formGrid}>
              {DRY_TEA_GRADES.map(grade => (
                <label key={grade} className={kit.fl}>
                  {DRY_TEA_GRADE_LABELS[grade]} (kg)
                  <input className={kit.inp} type="number" inputMode="decimal" step="0.1" min={0} value={outputDraft[grade]}
                    onChange={e => setOutputDraft(prev => ({ ...prev, [grade]: e.target.value }))} />
                </label>
              ))}
            </div>
            <Button variant="secondary" isLoading={busy} onClick={saveOutputs}>Lưu sản lượng</Button>
          </div>
        ) : outputs.length === 0 ? (
          <p className={`${kit.muted} ${styles.pad}`}>Mẻ không có sản lượng.</p>
        ) : null}
        {outputs.length > 0 && (
          <ul className={kit.list}>
            {outputs.map(o => (
              <li key={o.id} className={styles.row}>
                <strong className={styles.grow}>{DRY_TEA_GRADE_LABELS[o.grade]}</strong>
                <span>{kg(o.kg)} kg</span>
                <span className={kit.muted}>còn {kg(o.remaining_kg)} kg</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open && (
        <section className={kit.pn} aria-labelledby="finish-title">
          <div className={kit.ph}><h2 id="finish-title">Hoàn thành hoặc huỷ mẻ</h2></div>
          <div className={styles.form}>
            <label className={kit.fl}>
              Giải trình khi lệch khoảng chuẩn
              <textarea ref={noteRef} className={kit.inp} rows={3} maxLength={500} value={note} aria-invalid={!!noteError}
                aria-describedby={noteError ? 'finish-note-error' : undefined} onChange={e => { setNote(e.target.value); setNoteError('') }} />
            </label>
            {noteError && <p id="finish-note-error" role="alert" className={styles.error}>{noteError}</p>}
            <Button isLoading={busy} onClick={finish}>Hoàn thành mẻ</Button>
          </div>
          <div className={styles.form}>
            <label className={kit.fl}>
              Lý do huỷ mẻ
              <input className={kit.inp} maxLength={MAX_TEXT} value={reason} onChange={e => setReason(e.target.value)} />
            </label>
            <Button variant="secondary" isLoading={busy} onClick={cancel}>Huỷ mẻ</Button>
          </div>
        </section>
      )}

      {error && <p role="alert" className={`${styles.error} ${styles.pad}`}>{error}</p>}
      {notice && <p role="status" className={`${styles.status} ${styles.pad}`}>{notice}</p>}
    </div>
  )
}

