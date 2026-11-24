// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import Link from 'next/link'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, Modal, Pill, Skeleton } from '@/components/ui'
import type { DecisionChannel, Evidence, ProposalStatus, Risk } from '@/domain/agent/proposal'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import styles from './ProposalInbox.module.css'

export interface ProposalInboxItem {
  id: string
  agent: string
  kind: string
  titleVi: string
  reasonVi: string
  risk: Risk
  status: ProposalStatus
  createdAt: string
  expiresAt: string
  preview: string[]
  canDecide: boolean
  editableFields: string[]
  payload: Record<string, unknown>
  subjects?: { id: string; label: string }[]
  evidence: Evidence
  decidedByName?: string | null
  decidedAt?: string | null
  decisionChannel?: DecisionChannel | null
  decisionNote?: string | null
  result?: Record<string, unknown> | null
}

interface ProposalInboxProps {
  role: 'manager' | 'officer'
}

const RISK_LABEL: Record<Risk, string> = {
  low: 'Rủi ro thấp',
  medium: 'Rủi ro trung bình',
  high: 'Rủi ro cao',
}

const STATUS_LABEL: Record<ProposalStatus, { label: string; tone: 'green' | 'amber' | 'blue' | 'neutral' | 'danger' }> = {
  proposed: { label: 'Chờ duyệt', tone: 'amber' },
  approved: { label: 'Đã duyệt', tone: 'blue' },
  executed: { label: 'Đã thực hiện', tone: 'green' },
  failed: { label: 'Thực thi lỗi', tone: 'danger' },
  rejected: { label: 'Đã từ chối', tone: 'neutral' },
  expired: { label: 'Hết hạn', tone: 'neutral' },
  stale: { label: 'Dữ liệu đã đổi', tone: 'amber' },
}

const KIND_LABEL: Record<string, string> = {
  'journal.approve': 'Duyệt nhật ký',
  'journal.reject': 'Trả lại nhật ký',
}

const FIELD_LABEL: Record<string, string> = {
  reason_vi: 'Nội dung lý do gửi nông hộ',
}

const DECISION_ERROR = 'Không thể xử lý đề xuất'

/** Where an evidence row can be checked by hand; rows without a page get no link. */
function evidenceLink(role: 'manager' | 'officer', table: string): { href: string; label: string } | null {
  if (table === 'journal_entries') {
    return { href: role === 'manager' ? '/manager/journal-approve' : '/officer/journal', label: 'Mở nhật ký' }
  }
  if (table === 'parcel_crop_cycles') {
    return { href: role === 'manager' ? '/manager/farm-zones' : '/officer/farm-zones', label: 'Mở bản đồ thửa' }
  }
  return null
}

function formatDateTime(raw: string | null | undefined): string {
  if (!raw) return '—'
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date)
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return String(val)
  return JSON.stringify(val)
}

export function ProposalInbox({ role }: ProposalInboxProps) {
  const [view, setView] = useState<'open' | 'history'>('open')
  const [items, setItems] = useState<ProposalInboxItem[]>([])
  const [kindFilter, setKindFilter] = useState('all')
  const [riskFilter, setRiskFilter] = useState<'all' | Risk>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<ProposalInboxItem | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [rejectError, setRejectError] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<ProposalInboxItem | null>(null)
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [editError, setEditError] = useState<string | null>(null)
  // Once items are on screen a refresh keeps them, so the focused control stays in place.
  const hasItems = useRef(false)

  const load = useCallback(async () => {
    if (!hasItems.current) setIsLoading(true)
    try {
      const json = await fetchJson<{ data?: ProposalInboxItem[] }>(`/api/agent/proposals?view=${view}`)
      const next = json.data ?? []
      hasItems.current = next.length > 0
      setItems(next)
      setKindFilter((current) => (current === 'all' || next.some((i) => i.kind === current) ? current : 'all'))
      setLoadFailed(false)
    } catch {
      setLoadFailed(true)
    } finally {
      setIsLoading(false)
    }
  }, [view])

  useEffect(() => {
    load()
  }, [load])

  const changeView = (next: 'open' | 'history') => {
    if (next === view) return
    hasItems.current = false
    setItems([])
    setView(next)
  }

  const postDecision = async (item: ProposalInboxItem, body: Record<string, unknown>) => {
    const res = await fetch(`/api/agent/proposals/${item.id}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    return { ok: res.ok, json }
  }

  /** Approves, optionally with edited fields. Returns the error message to show, or null on success. */
  const approve = async (item: ProposalInboxItem, edited?: Record<string, string>): Promise<string | null> => {
    setBusyId(item.id)
    try {
      const { ok, json } = await postDecision(item, edited ? { decision: 'approve', edited_payload: edited } : { decision: 'approve' })
      if (!ok) {
        const message = json?.error?.message || DECISION_ERROR
        toast.error(message)
        await load()
        return message
      }
      if (json?.data?.outcome === 'failed') {
        toast.error(`Thực thi thất bại: ${json.data.error || 'Lỗi không xác định'}`)
      } else {
        toast.success(edited ? 'Đã sửa và duyệt' : 'Đã duyệt và thực hiện')
      }
      await load()
      return null
    } catch {
      toast.error('Lỗi kết nối khi duyệt đề xuất')
      return 'Lỗi kết nối khi duyệt đề xuất'
    } finally {
      setBusyId(null)
    }
  }

  const openEditModal = (item: ProposalInboxItem) => {
    setEditTarget(item)
    setEditValues(Object.fromEntries(item.editableFields.map((f) => [f, String(item.payload[f] ?? '')])))
    setEditError(null)
  }

  const closeEditModal = () => {
    setEditTarget(null)
    setEditValues({})
    setEditError(null)
  }

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editTarget) return
    const edited: Record<string, string> = {}
    for (const field of editTarget.editableFields) {
      const value = (editValues[field] ?? '').trim()
      if (!value) {
        setEditError('Vui lòng điền đầy đủ các trường')
        return
      }
      edited[field] = value
    }
    setEditError(null)
    const error = await approve(editTarget, edited)
    if (error) {
      setEditError(error)
    } else {
      closeEditModal()
    }
  }

  const openRejectModal = (item: ProposalInboxItem) => {
    setRejectTarget(item)
    setRejectNote('')
    setRejectError(null)
  }

  const closeRejectModal = () => {
    setRejectTarget(null)
    setRejectNote('')
    setRejectError(null)
  }

  const submitReject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!rejectTarget) return
    const trimmed = rejectNote.trim()
    if (!trimmed) {
      setRejectError('Vui lòng nhập lý do từ chối')
      return
    }
    setBusyId(rejectTarget.id)
    setRejectError(null)
    try {
      const { ok, json } = await postDecision(rejectTarget, { decision: 'reject', note: trimmed })
      if (!ok) {
        setRejectError(json?.error?.message || 'Không thể từ chối đề xuất')
        return
      }
      toast.success('Đã từ chối đề xuất')
      closeRejectModal()
      await load()
    } catch {
      setRejectError('Lỗi kết nối khi từ chối đề xuất')
    } finally {
      setBusyId(null)
    }
  }

  const kindOptions = Array.from(new Set(items.map((i) => i.kind)))
  const visible = items.filter(
    (i) => (kindFilter === 'all' || i.kind === kindFilter) && (riskFilter === 'all' || i.risk === riskFilter)
  )

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>TRỢ LÝ VẬN HÀNH ({role === 'manager' ? 'TRƯỞNG HTX' : 'CÁN BỘ KT'})</span>
          <h1 className={styles.title}>Hộp duyệt đề xuất AI</h1>
          <p className={styles.subtitle}>
            Xem lý do, bằng chứng đối chiếu và phê duyệt các hành động do AI đề xuất cho HTX.
          </p>
        </div>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.tabs} role="group" aria-label="Chế độ xem">
          <button
            type="button"
            aria-pressed={view === 'open'}
            className={`${styles.tab} ${view === 'open' ? styles.tabActive : ''}`}
            onClick={() => changeView('open')}
          >
            Đang chờ duyệt
          </button>
          <button
            type="button"
            aria-pressed={view === 'history'}
            className={`${styles.tab} ${view === 'history' ? styles.tabActive : ''}`}
            onClick={() => changeView('history')}
          >
            Lịch sử
          </button>
        </div>

        <div className={styles.filters}>
          <div className={styles.filterField}>
            <label htmlFor="proposal-kind-filter" className={styles.filterLabel}>
              Loại đề xuất
            </label>
            <select
              id="proposal-kind-filter"
              className={styles.select}
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
            >
              <option value="all">Tất cả loại</option>
              {kindOptions.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABEL[kind] ?? kind}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.filterField}>
            <label htmlFor="proposal-risk-filter" className={styles.filterLabel}>
              Mức rủi ro
            </label>
            <select
              id="proposal-risk-filter"
              className={styles.select}
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value as 'all' | Risk)}
            >
              <option value="all">Tất cả mức</option>
              {(Object.keys(RISK_LABEL) as Risk[]).map((risk) => (
                <option key={risk} value={risk}>
                  {RISK_LABEL[risk]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {isLoading && items.length === 0 ? (
        <div className={styles.list} aria-busy="true" aria-label="Đang tải đề xuất">
          {[1, 2].map((idx) => (
            <Card key={idx} className={styles.card}>
              <Skeleton variant="text" width="45%" height={20} />
              <Skeleton variant="text" width="90%" height={16} />
              <Skeleton variant="rect" width="100%" height={64} />
            </Card>
          ))}
        </div>
      ) : loadFailed ? (
        <Card className={styles.stateCard}>
          <p className={styles.errorText}>{LOAD_FAILED_MESSAGE}</p>
          <Button variant="secondary" onClick={load}>
            Thử lại
          </Button>
        </Card>
      ) : items.length === 0 ? (
        <Card className={styles.stateCard}>
          <p className={styles.emptyText}>Chưa có đề xuất nào</p>
        </Card>
      ) : visible.length === 0 ? (
        <Card className={styles.stateCard}>
          <p className={styles.emptyText}>Không có đề xuất khớp bộ lọc</p>
        </Card>
      ) : (
        <div className={styles.list}>
          {visible.map((item) => {
            const statusInfo = STATUS_LABEL[item.status]
            const subjectById = new Map((item.subjects ?? []).map((s) => [s.id, s.label]))

            return (
              <Card key={item.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardHeading}>
                    <h2 className={styles.cardTitle}>{item.titleVi}</h2>
                    <div className={styles.metaRow}>
                      <span>Agent: {item.agent}</span>
                      <span>·</span>
                      <span>{formatDateTime(item.createdAt)}</span>
                    </div>
                  </div>
                  <div className={styles.badges}>
                    {item.risk === 'high' ? (
                      <span className={styles.dangerPill}>{RISK_LABEL[item.risk]}</span>
                    ) : (
                      <Pill tone={item.risk === 'low' ? 'green' : 'amber'}>{RISK_LABEL[item.risk]}</Pill>
                    )}
                    {view === 'history' &&
                      (statusInfo.tone === 'danger' ? (
                        <span className={styles.dangerPill}>{statusInfo.label}</span>
                      ) : (
                        <Pill tone={statusInfo.tone}>{statusInfo.label}</Pill>
                      ))}
                  </div>
                </div>

                <p className={styles.reason}>{item.reasonVi}</p>

                {item.preview.length > 0 && (
                  <div className={styles.section}>
                    <h3 className={styles.sectionTitle}>Xem trước hành động</h3>
                    <ul className={styles.previewList}>
                      {item.preview.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className={styles.section}>
                  <h3 className={styles.sectionTitle}>Bằng chứng</h3>
                  <ul className={styles.evidenceList}>
                    {(item.evidence?.rows ?? []).map((row, idx) => {
                      const label = subjectById.get(row.id) ?? `${row.table} · ${row.id}`
                      const link = evidenceLink(role, row.table)
                      return (
                        <li key={`${row.table}-${row.id}-${idx}`} className={styles.evidenceItem}>
                          <div className={styles.evidenceLabel}>{label}</div>
                          {row.values && Object.keys(row.values).length > 0 && (
                            <dl className={styles.kvList}>
                              {Object.entries(row.values).map(([k, v]) => (
                                <div key={k} className={styles.kvRow}>
                                  <dt className={styles.kvKey}>{k}:</dt>
                                  <dd className={styles.kvVal}>{formatValue(v)}</dd>
                                </div>
                              ))}
                            </dl>
                          )}
                          {link && (
                            <Link href={link.href} className={styles.inlineLink}>
                              {link.label}
                            </Link>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>

                {view === 'history' && (
                  <div className={styles.historyMeta}>
                    <span>
                      Người xử lý: <strong>{item.decidedByName || 'Hệ thống'}</strong>
                      {item.decisionChannel ? ` (${item.decisionChannel})` : ''} · {formatDateTime(item.decidedAt)}
                    </span>
                    {item.decisionNote && <p className={styles.historyNote}>Ghi chú: {item.decisionNote}</p>}
                    {item.result && (
                      <p className={styles.historyNote}>Kết quả: {formatValue(item.result)}</p>
                    )}
                  </div>
                )}

                {view === 'open' && item.canDecide && (
                  <div className={styles.actions}>
                    <Button
                      variant="primary"
                      isLoading={busyId === item.id}
                      disabled={busyId !== null}
                      onClick={() => approve(item)}
                    >
                      Duyệt
                    </Button>
                    {item.editableFields.length > 0 && (
                      <Button variant="secondary" disabled={busyId !== null} onClick={() => openEditModal(item)}>
                        Sửa rồi duyệt
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      disabled={busyId !== null}
                      onClick={() => openRejectModal(item)}
                    >
                      Từ chối
                    </Button>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <Modal isOpen={editTarget !== null} onClose={closeEditModal} title="Sửa rồi duyệt" size="sm">
        <form onSubmit={submitEdit} className={styles.modalForm}>
          {editTarget?.editableFields.map((field) => (
            <div key={field} className={styles.fieldGroup}>
              <label htmlFor={`proposal-edit-${field}`} className={styles.modalLabel}>
                {FIELD_LABEL[field] ?? field}
              </label>
              <textarea
                id={`proposal-edit-${field}`}
                className={styles.textarea}
                rows={3}
                maxLength={500}
                value={editValues[field] ?? ''}
                aria-invalid={editError ? true : undefined}
                aria-describedby={editError ? 'proposal-edit-error' : undefined}
                onChange={(e) => setEditValues((prev) => ({ ...prev, [field]: e.target.value }))}
              />
            </div>
          ))}
          {editError && (
            <p id="proposal-edit-error" className={styles.errorText} role="alert">
              {editError}
            </p>
          )}
          <div className={styles.modalActions}>
            <Button variant="secondary" onClick={closeEditModal}>
              Huỷ
            </Button>
            <Button type="submit" variant="primary" isLoading={busyId === editTarget?.id}>
              Duyệt bản đã sửa
            </Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={rejectTarget !== null} onClose={closeRejectModal} title="Từ chối đề xuất AI" size="sm">
        <form onSubmit={submitReject} className={styles.modalForm}>
          <label htmlFor="proposal-reject-note" className={styles.modalLabel}>
            Lý do từ chối
          </label>
          <textarea
            id="proposal-reject-note"
            className={styles.textarea}
            rows={4}
            maxLength={500}
            value={rejectNote}
            aria-invalid={rejectError ? true : undefined}
            aria-describedby={rejectError ? 'proposal-reject-error' : undefined}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="Nhập lý do từ chối (bắt buộc)..."
          />
          {rejectError && (
            <p id="proposal-reject-error" className={styles.errorText} role="alert">
              {rejectError}
            </p>
          )}
          <div className={styles.modalActions}>
            <Button variant="secondary" onClick={closeRejectModal}>
              Huỷ
            </Button>
            <Button type="submit" variant="danger" isLoading={busyId === rejectTarget?.id}>
              Xác nhận từ chối
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
