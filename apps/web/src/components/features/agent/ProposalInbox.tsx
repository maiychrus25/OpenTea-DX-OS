// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useCallback, useEffect, useState } from 'react'
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
  const [isLoading, setIsLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<ProposalInboxItem | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [rejectError, setRejectError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const json = await fetchJson<{ data?: ProposalInboxItem[] }>(`/api/agent/proposals?view=${view}`)
      setItems(json.data ?? [])
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

  const handleApprove = async (item: ProposalInboxItem) => {
    setBusyId(item.id)
    try {
      const res = await fetch(`/api/agent/proposals/${item.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'approve' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.error?.message || 'Không thể xử lý đề xuất')
        await load()
        return
      }
      if (json?.data?.outcome === 'failed') {
        toast.error(`Thực thi thất bại: ${json.data.error || 'Lỗi không xác định'}`)
      } else {
        toast.success('Đã duyệt và thực hiện')
      }
      await load()
    } catch {
      toast.error('Lỗi kết nối khi duyệt đề xuất')
    } finally {
      setBusyId(null)
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
      const res = await fetch(`/api/agent/proposals/${rejectTarget.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'reject', note: trimmed }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
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

      <div className={styles.tabs} role="tablist" aria-label="Bộ lọc đề xuất">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'open'}
          className={`${styles.tab} ${view === 'open' ? styles.tabActive : ''}`}
          onClick={() => setView('open')}
        >
          Đang chờ duyệt
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'history'}
          className={`${styles.tab} ${view === 'history' ? styles.tabActive : ''}`}
          onClick={() => setView('history')}
        >
          Lịch sử
        </button>
      </div>

      {isLoading ? (
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
      ) : (
        <div className={styles.list}>
          {items.map((item) => {
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
                      onClick={() => handleApprove(item)}
                    >
                      Duyệt
                    </Button>
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
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="Nhập lý do từ chối (bắt buộc)..."
          />
          {rejectError && (
            <p className={styles.errorText} role="alert">
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
