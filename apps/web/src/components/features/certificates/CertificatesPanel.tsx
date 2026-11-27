// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import kit from '@/components/features/farmer-web/kit.module.css'
import { localDay } from '@/domain/shared/local-day'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import type { CertificateKind, CertificateView } from '@/lib/certificates/types'
import { processingErrorText } from '@/lib/processing/errors'
import { dayMonthYear } from '@/lib/weighing/format'
import styles from './certificates.module.css'

const KIND_LABELS: Record<CertificateKind, string> = { VIETGAP: 'VietGAP', OCOP: 'OCOP', ORGANIC: 'Hữu cơ', OTHER: 'Khác' }
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
export const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_REASON = 200
const MIN_REASON = 3

/** The status words of the list; computed by the server at read time. */
export function statusText(c: CertificateView): string {
  if (c.status === 'REVOKED') return 'Đã thu hồi'
  if (c.status === 'EXPIRED') return 'Đã hết hạn'
  return `Còn hiệu lực đến ${dayMonthYear(c.expires_on)}`
}

/** The first problem with a chosen file, checked in the browser before upload (the server checks the bytes too). */
export function fileProblem(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) return 'Chỉ nhận tệp PDF, JPG hoặc PNG.'
  if (file.size > MAX_FILE_BYTES) return 'Tệp vượt quá 10 MB.'
  return null
}

interface Props {
  /** Only the manager revokes a certificate. */
  canRevoke: boolean
}

/** Cooperative certificates: the list with status, the add form, and revoke for the manager. */
export function CertificatesPanel({ canRevoke }: Props) {
  const [items, setItems] = useState<CertificateView[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [formKey, setFormKey] = useState(0)

  const [kind, setKind] = useState<CertificateKind>('VIETGAP')
  const [number, setNumber] = useState('')
  const [issuer, setIssuer] = useState('')
  const [issuedOn, setIssuedOn] = useState('')
  const [expiresOn, setExpiresOn] = useState('')
  const [scopeNote, setScopeNote] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const [revoking, setRevoking] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = () => fetchJson<{ data: CertificateView[] }>('/api/certificates')
    .then(body => { setItems(body.data); setLoadError('') })
    .catch(() => setLoadError(LOAD_FAILED_MESSAGE))

  useEffect(() => { void load() }, [])

  function formProblem(): string | null {
    if (!/^.{1,60}$/.test(number.trim())) return 'Nhập số chứng nhận (tối đa 60 ký tự).'
    if (!/^.{1,120}$/.test(issuer.trim())) return 'Nhập tổ chức cấp (tối đa 120 ký tự).'
    if (!issuedOn || !expiresOn) return 'Nhập ngày cấp và ngày hết hạn.'
    if (expiresOn < issuedOn) return 'Ngày hết hạn phải sau hoặc cùng ngày cấp.'
    if (scopeNote.trim().length > 200) return 'Phạm vi tối đa 200 ký tự.'
    if (!file) return 'Chọn tệp chứng nhận (PDF, JPG hoặc PNG).'
    return fileProblem(file)
  }

  async function add() {
    const problem = formProblem()
    if (problem) { setError(problem); return }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const form = new FormData()
      form.append('file', file!)
      form.append('kind', kind)
      form.append('number', number.trim())
      form.append('issuer', issuer.trim())
      form.append('issued_on', issuedOn)
      form.append('expires_on', expiresOn)
      if (scopeNote.trim()) form.append('scope_note', scopeNote.trim())
      // No Content-Type header: the browser sets the multipart boundary.
      const res = await fetch('/api/certificates', { method: 'POST', body: form })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(processingErrorText(json?.error?.code, json?.error?.message, 'Không lưu được chứng nhận.')); return }
      setNotice(`Đã lưu chứng nhận ${number.trim()}.`)
      setNumber(''); setIssuer(''); setIssuedOn(''); setExpiresOn(''); setScopeNote(''); setFile(null)
      setFormKey(k => k + 1)
      void load()
    } catch {
      setError('Lỗi kết nối máy chủ.')
    } finally {
      setBusy(false)
    }
  }

  async function revoke(id: string) {
    const text = reason.trim()
    if (text.length < MIN_REASON || text.length > MAX_REASON) { setError(`Nhập lý do thu hồi từ ${MIN_REASON} đến ${MAX_REASON} ký tự.`); return }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const res = await fetch(`/api/certificates/${id}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: text }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(processingErrorText(json?.error?.code, json?.error?.message, 'Không thu hồi được chứng nhận.')); return }
      setNotice('Đã thu hồi chứng nhận.')
      setRevoking(null)
      setReason('')
      void load()
    } catch {
      setError('Lỗi kết nối máy chủ.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.layout}>
      <section className={kit.pn} aria-labelledby="certificates-title">
        <div className={kit.ph}><h2 id="certificates-title">Chứng nhận của HTX</h2></div>
        {loadError && <p role="alert" className={`${styles.error} ${styles.pad}`}>{loadError}</p>}
        {!loadError && items === null && <p className={`${kit.muted} ${styles.pad}`}>Đang tải chứng nhận...</p>}
        {items?.length === 0 && <p className={`${kit.muted} ${styles.pad}`}>Chưa có chứng nhận nào. Thêm chứng nhận ở bên cạnh.</p>}
        {items && items.length > 0 && (
          <ul className={kit.list}>
            {items.map(c => (
              <li key={c.id} className={styles.row}>
                <div className={styles.grow}>
                  <strong>{KIND_LABELS[c.kind]} · {c.number}</strong>
                  <span className={kit.muted}>{c.issuer}{c.scope_note ? ` · ${c.scope_note}` : ''}</span>
                  <span className={c.status === 'VALID' ? styles.valid : styles.invalid}>{statusText(c)}</span>
                  {c.revoke_reason && <span className={kit.muted}>Lý do thu hồi: {c.revoke_reason}</span>}
                </div>
                <div className={styles.actions}>
                  <a className={styles.link} href={`/api/certificates/${c.id}/file`} target="_blank" rel="noopener noreferrer">Mở tệp</a>
                  {canRevoke && c.status !== 'REVOKED' && (
                    <Button size="sm" variant="secondary" aria-label={`Thu hồi ${c.number}`} onClick={() => { setRevoking(c.id); setReason(''); setError('') }}>Thu hồi</Button>
                  )}
                </div>
                {revoking === c.id && (
                  <div className={styles.revokeBox}>
                    <label className={kit.fl}>
                      Lý do thu hồi
                      <input className={kit.inp} maxLength={MAX_REASON} value={reason} onChange={e => setReason(e.target.value)} />
                    </label>
                    <div className={styles.actions}>
                      <Button size="sm" variant="secondary" onClick={() => setRevoking(null)}>Hủy</Button>
                      <Button size="sm" isLoading={busy} onClick={() => revoke(c.id)}>Xác nhận thu hồi</Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {notice && <p role="status" className={`${styles.status} ${styles.pad}`}>{notice}</p>}
      </section>

      <section className={kit.pn} aria-labelledby="certificate-form-title">
        <div className={kit.ph}><h2 id="certificate-form-title">Thêm chứng nhận</h2></div>
        <div className={styles.form} key={formKey}>
          <label className={kit.fl}>
            Loại
            <select className={kit.inp} value={kind} onChange={e => setKind(e.target.value as CertificateKind)}>
              {(Object.keys(KIND_LABELS) as CertificateKind[]).map(k => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
            </select>
          </label>
          <label className={kit.fl}>
            Số chứng nhận
            <input className={kit.inp} maxLength={60} value={number} onChange={e => setNumber(e.target.value)} />
          </label>
          <label className={kit.fl}>
            Tổ chức cấp
            <input className={kit.inp} maxLength={120} value={issuer} onChange={e => setIssuer(e.target.value)} />
          </label>
          <div className={styles.dates}>
            <label className={kit.fl}>
              Ngày cấp
              <input className={kit.inp} type="date" max={localDay(new Date())} value={issuedOn} onChange={e => setIssuedOn(e.target.value)} />
            </label>
            <label className={kit.fl}>
              Ngày hết hạn
              <input className={kit.inp} type="date" value={expiresOn} onChange={e => setExpiresOn(e.target.value)} />
            </label>
          </div>
          <label className={kit.fl}>
            Phạm vi (tuỳ chọn)
            <input className={kit.inp} maxLength={200} value={scopeNote} placeholder="VD: Vùng Tân Cương, 12 ha" onChange={e => setScopeNote(e.target.value)} />
          </label>
          <label className={kit.fl}>
            Tệp chứng nhận (PDF, JPG hoặc PNG, tối đa 10 MB)
            <input ref={fileRef} className={kit.inp} type="file" accept="application/pdf,image/jpeg,image/png"
              onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </label>
          {error && <p role="alert" className={styles.error}>{error}</p>}
          <Button isLoading={busy} onClick={add}>Lưu chứng nhận</Button>
        </div>
      </section>
    </div>
  )
}
