// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import Link from 'next/link'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, Modal, Pill, Skeleton } from '@/components/ui'
import {
  ACTIVITY_LABEL,
  formatVnDate,
  JOURNAL_STATUS_LABEL,
  type JournalSubject,
} from '@/application/agent/actions/journal-labels'
import { DISEASE_LABEL_VI } from '@/application/agent/actions/disease-labels'
import type { DecisionChannel, Evidence, ProposalStatus, Risk } from '@/domain/agent/proposal'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import { CAMPAIGN_CHANGED_EVENT } from './CampaignPanel'
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
  subjects?: JournalSubject[]
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
  sent_to_staff_app: { label: 'Đã gửi app nhân sự', tone: 'blue' },
  executed: { label: 'Đã thực hiện', tone: 'green' },
  failed: { label: 'Thực thi lỗi', tone: 'danger' },
  rejected: { label: 'Đã từ chối', tone: 'neutral' },
  expired: { label: 'Hết hạn', tone: 'neutral' },
  stale: { label: 'Dữ liệu đã đổi', tone: 'amber' },
}

const KIND_LABEL: Record<string, string> = {
  'journal.approve': 'Duyệt nhật ký',
  'journal.reject': 'Trả lại nhật ký',
  'notification.internal': 'Thông báo nội bộ',
  'notification.households': 'Thông báo nông hộ',
  'disease.inspection': 'Đề nghị kiểm tra dịch bệnh',
  'harvest.approve': 'Duyệt thu hoạch',
  'bulletin.publish': 'Đăng bản tin thị trường',
  'staff.task.create': 'Giao việc cho nhân sự',
}

const FIELD_LABEL: Record<string, string> = {
  reason_vi: 'Nội dung lý do gửi nông hộ',
  note_vi: 'Lời nhắn thêm cho nông hộ',
  bulletin_vi: 'Nội dung bản tin',
}

/** Labels that differ for one kind: `note_vi` is a note to households elsewhere and to staff here. */
const KIND_FIELD_LABEL: Record<string, Record<string, string>> = {
  'staff.task.create': {
    assignee_ref: 'Mã nhân sự được giao',
    due_date: 'Hạn làm (YYYY-MM-DD)',
    note_vi: 'Ghi chú cho nhân sự',
  },
}

const PARCEL_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Nháp',
  SOWING: 'Gieo trồng',
  TENDING: 'Đang chăm sóc',
  HARVEST_APPROVED: 'Đã duyệt thu hoạch',
  HARVESTED: 'Đã thu hoạch',
}

const DISEASE_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  REJECTED: 'Từ chối',
}

const SENSOR_LABEL: Record<string, { label: string; unit: string }> = {
  soil_moisture: { label: 'Độ ẩm đất', unit: '%' },
  soil_temperature: { label: 'Nhiệt độ đất', unit: '°C' },
  air_temperature: { label: 'Nhiệt độ không khí', unit: '°C' },
  air_humidity: { label: 'Độ ẩm không khí', unit: '%' },
  rainfall: { label: 'Lượng mưa', unit: 'mm' },
}

const METRIC_LABEL: Record<string, string> = {
  export_price: 'Giá xuất khẩu',
  import_tariff: 'Thuế nhập khẩu',
  production_volume: 'Sản lượng',
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

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/

function formatValue(val: unknown): string {
  if (val === null || val === undefined || val === '') return '—'
  if (typeof val === 'string') return ISO_TIMESTAMP.test(val) ? (formatVnDate(val) ?? val) : val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  if (Array.isArray(val)) return val.length > 0 ? val.map(formatValue).join(', ') : '—'
  if (typeof val === 'object') {
    return Object.entries(val).map(([key, inner]) => `${key}: ${formatValue(inner)}`).join('; ')
  }
  return String(val)
}

interface EvidenceView {
  title: string
  lines: string[]
  items?: string[]
}

interface JournalActivityValues {
  activity_detail?: string | null
  product_name?: string | null
  dosage?: string | null
  withdrawal_days?: number | null
  safe_harvest_date?: string | null
}

function asText(val: unknown): string | null {
  return typeof val === 'string' && val !== '' ? val : null
}

/** "<product> — <dosage> — cách ly n ngày (an toàn từ …)", leaving out what is missing. */
function journalActivityLine(activity: JournalActivityValues): string {
  const head = activity.product_name || activity.activity_detail || null
  const safe = formatVnDate(asText(activity.safe_harvest_date))
  let withdrawal: string | null = null
  if (activity.withdrawal_days !== null && activity.withdrawal_days !== undefined) {
    withdrawal = `cách ly ${activity.withdrawal_days} ngày${safe ? ` (an toàn từ ${safe})` : ''}`
  } else if (safe) {
    withdrawal = `an toàn từ ${safe}`
  }
  return [head, asText(activity.dosage), withdrawal].filter((part): part is string => Boolean(part)).join(' — ')
}

function journalEntryView(values: Record<string, unknown>, subject?: JournalSubject): EvidenceView {
  const activityKey = asText(values.activity_type)
  const status = asText(values.status)
  const activities = Array.isArray(values.activities) ? (values.activities as JournalActivityValues[]) : []
  const items = activities.map(journalActivityLine).filter(Boolean)
  const header = [
    subject ? `Thửa ${subject.parcel}` : 'Nhật ký canh tác',
    activityKey ? (ACTIVITY_LABEL[activityKey] ?? activityKey) : (subject?.activity ?? null),
    formatVnDate(asText(values.entry_date)),
  ]
  return {
    title: header.filter((part): part is string => Boolean(part)).join(' · '),
    lines: [
      `Trạng thái: ${status ? (JOURNAL_STATUS_LABEL[status] ?? status) : '—'}`,
      `Ghi chú: ${asText(values.notes) ?? 'Không có ghi chú'}`,
      ...(items.length > 0 ? ['Hoạt động:'] : []),
    ],
    items,
  }
}

function cropCycleView(values: Record<string, unknown>): EvidenceView {
  const season = asText(values.season)
  const lines: string[] = []
  const estimated = formatVnDate(asText(values.estimated_harvest_date))
  if (estimated) lines.push(`Thu hoạch dự kiến: ${estimated}`)
  const harvested = formatVnDate(asText(values.harvested_at))
  if (harvested) lines.push(`Đã thu hoạch: ${harvested}`)
  return { title: season ? `Vụ ${season}` : 'Vụ trồng', lines }
}

/** A `*_milli` value (floor of value times 1000) shown in its unit, without the raw integer. */
function milliText(val: unknown, unit: string): string {
  if (typeof val !== 'number') return '—'
  const shown = (val / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 3 })
  return unit ? `${shown} ${unit}` : shown
}

function parcelView(values: Record<string, unknown>): EvidenceView {
  const code = asText(values.parcel_code)
  const status = asText(values.status)
  const approved = formatVnDate(asText(values.harvest_approved_at))
  return {
    title: code ? `Thửa ${code}` : 'Thửa',
    lines: [
      `Trạng thái: ${status ? (PARCEL_STATUS_LABEL[status] ?? status) : '—'}`,
      `Duyệt thu hoạch: ${approved ?? 'chưa duyệt'}`,
    ],
  }
}

function diseaseReportView(values: Record<string, unknown>): EvidenceView {
  const key = asText(values.confirmed_diagnosis) ?? asText(values.ai_disease_name)
  const status = asText(values.status)
  const day = formatVnDate(asText(values.detection_date))
  return {
    title: day ? `Báo cáo bệnh · ${day}` : 'Báo cáo bệnh',
    lines: [
      `Bệnh: ${key ? (DISEASE_LABEL_VI[key] ?? key) : 'Chưa rõ'}`,
      `Trạng thái: ${status ? (DISEASE_STATUS_LABEL[status] ?? status) : '—'}`,
    ],
  }
}

function sensorReadingView(values: Record<string, unknown>): EvidenceView {
  const sensor = SENSOR_LABEL[asText(values.sensor) ?? ''] ?? { label: 'Cảm biến', unit: '' }
  const code = asText(values.parcel_code)
  return {
    title: code ? `${sensor.label} · thửa ${code}` : sensor.label,
    lines: [`Giá trị: ${milliText(values.value_milli, sensor.unit)}`, `Lúc: ${formatDateTime(asText(values.ts))}`],
  }
}

function weatherView(values: Record<string, unknown>): EvidenceView {
  const days = Array.isArray(values.forecast_days) ? values.forecast_days : []
  const sums = Array.isArray(values.forecast_precipitation_milli) ? values.forecast_precipitation_milli : []
  return {
    title: `Thời tiết · ${formatDateTime(asText(values.recorded_at))}`,
    lines: [
      `Lượng mưa: ${milliText(values.precipitation_milli, 'mm')}`,
      ...(days.length > 0 ? ['Dự báo mưa:'] : []),
    ],
    items: days.map((day, i) => `${formatVnDate(String(day)) ?? String(day)}: ${milliText(sums[i], 'mm')}`),
  }
}

function marketView(values: Record<string, unknown>): EvidenceView {
  const metric = asText(values.metric)
  const source = asText(values.source)
  const period = asText(values.period)
  return {
    title: `Giá thị trường · ${asText(values.commodity) ?? ''}`.trim(),
    lines: [
      `${metric ? (METRIC_LABEL[metric] ?? metric) : 'Chỉ số'}: ${milliText(values.value_milli, asText(values.unit) ?? '')}`,
      `Nguồn: ${source ?? '—'} · kỳ ${period ?? '—'}`,
      `Cập nhật: ${formatDateTime(asText(values.fetched_at))}`,
    ],
  }
}

function evidenceView(row: Evidence['rows'][number], subject?: JournalSubject): EvidenceView {
  const values = row.values ?? {}
  if (row.table === 'journal_entries') return journalEntryView(values, subject)
  if (row.table === 'parcel_crop_cycles') return cropCycleView(values)
  if (row.table === 'parcels') return parcelView(values)
  if (row.table === 'disease_reports') return diseaseReportView(values)
  if (row.table === 'sensor_readings') return sensorReadingView(values)
  if (row.table === 'weather_cache') return weatherView(values)
  if (row.table === 'market_data') return marketView(values)
  return {
    title: row.table,
    lines: Object.entries(values).map(([key, val]) => `${key}: ${formatValue(val)}`),
  }
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
  // Proposals that are items of today's campaign (C8); a dropped campaign leaves none.
  const [campaignIds, setCampaignIds] = useState<Set<string>>(new Set())
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

  const loadCampaignTags = useCallback(async () => {
    try {
      const json = await fetchJson<{ campaign: { status: string; items: { proposalId: string }[] } | null }>('/api/agent/campaigns/today')
      const campaign = json.campaign
      setCampaignIds(campaign && campaign.status !== 'dropped' ? new Set(campaign.items.map((i) => i.proposalId)) : new Set())
    } catch {
      setCampaignIds(new Set())
    }
  }, [])

  useEffect(() => {
    load()
    loadCampaignTags()
  }, [load, loadCampaignTags])

  // The campaign panel and this list share decisions: either side announces a change and both reload.
  useEffect(() => {
    const onChange = () => {
      load()
      loadCampaignTags()
    }
    window.addEventListener(CAMPAIGN_CHANGED_EVENT, onChange)
    return () => window.removeEventListener(CAMPAIGN_CHANGED_EVENT, onChange)
  }, [load, loadCampaignTags])

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
      window.dispatchEvent(new Event(CAMPAIGN_CHANGED_EVENT))
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
    // An empty field keeps the proposal's value (the server merges the edit over the payload and checks the schema),
    // so optional fields such as a staff task's note can stay empty.
    const edited: Record<string, string> = {}
    for (const field of editTarget.editableFields) {
      const value = (editValues[field] ?? '').trim()
      if (value) edited[field] = value
    }
    if (Object.keys(edited).length === 0) {
      setEditError('Vui lòng điền ít nhất một trường')
      return
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
      window.dispatchEvent(new Event(CAMPAIGN_CHANGED_EVENT))
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
          <Link href={`/${role}/ai/settings`} className={styles.tab}>
            Cài đặt
          </Link>
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
            const subjectById = new Map((item.subjects ?? []).map((s) => [s.id, s]))

            return (
              <Card key={item.id} id={`proposal-${item.id}`} className={styles.card}>
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
                    {campaignIds.has(item.id) && <Pill tone="blue" size="md">Trong chiến dịch hôm nay</Pill>}
                    {item.risk === 'high' ? (
                      <span className={styles.dangerPill}>{RISK_LABEL[item.risk]}</span>
                    ) : (
                      <Pill tone={item.risk === 'low' ? 'green' : 'amber'} size="md">{RISK_LABEL[item.risk]}</Pill>
                    )}
                    {view === 'history' &&
                      (statusInfo.tone === 'danger' ? (
                        <span className={styles.dangerPill}>{statusInfo.label}</span>
                      ) : (
                        <Pill tone={statusInfo.tone} size="md">{statusInfo.label}</Pill>
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
                      const view = evidenceView(row, subjectById.get(row.id))
                      const link = evidenceLink(role, row.table)
                      return (
                        <li key={`${row.table}-${row.id}-${idx}`} className={styles.evidenceItem}>
                          <div className={styles.evidenceLabel}>{view.title}</div>
                          {view.lines.length > 0 && (
                            <div className={styles.evidenceLines}>
                              {view.lines.map((line, i) => (
                                <p key={i} className={styles.evidenceLine}>
                                  {line}
                                </p>
                              ))}
                            </div>
                          )}
                          {view.items && view.items.length > 0 && (
                            <ul className={styles.evidenceItems}>
                              {view.items.map((line, i) => (
                                <li key={i}>{line}</li>
                              ))}
                            </ul>
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
                {KIND_FIELD_LABEL[editTarget.kind]?.[field] ?? FIELD_LABEL[field] ?? field}
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
