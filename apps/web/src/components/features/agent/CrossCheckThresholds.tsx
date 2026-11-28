// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui'
import { LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import styles from './AgentSettingsPanel.module.css'

/** One place to switch the route if the backend moves it. */
export const AGENT_CROSS_CHECK_URL = '/api/agent/settings/cross-check'

export interface CrossCheckThresholds {
  grace_days: number
  fresh_norm_kg_per_ha_flush: number
  norm_tolerance: number
  /** Stored as a fraction (0.2 is 20%). The form shows whole percent. */
  realert_extra: number
}

type ThresholdKey = keyof CrossCheckThresholds

export const CROSS_CHECK_DEFAULTS: CrossCheckThresholds = {
  grace_days: 10,
  fresh_norm_kg_per_ha_flush: 1800,
  norm_tolerance: 1.35,
  realert_extra: 0.2,
}

const SAVE_FAILED_MESSAGE = 'Không thể lưu ngưỡng đối soát. Vui lòng thử lại.'

/** Draft values as typed. */
interface Draft {
  grace_days: string
  fresh_norm_kg_per_ha_flush: string
  norm_tolerance: string
  realert_percent: string
}

const toDraft = (t: CrossCheckThresholds): Draft => ({
  grace_days: String(t.grace_days),
  fresh_norm_kg_per_ha_flush: String(t.fresh_norm_kg_per_ha_flush),
  norm_tolerance: t.norm_tolerance.toFixed(2),
  realert_percent: String(Math.round(t.realert_extra * 100)),
})

const isWhole = (text: string) => /^\d+$/.test(text.trim())

/** Returns the values to send, or the message under each field that is out of range. */
function parseDraft(draft: Draft): { values: CrossCheckThresholds } | { errors: Partial<Record<ThresholdKey, string>> } {
  const errors: Partial<Record<ThresholdKey, string>> = {}
  const grace = Number(draft.grace_days)
  if (!isWhole(draft.grace_days) || grace < 3 || grace > 30) errors.grace_days = 'Nhập số nguyên từ 3 đến 30.'
  const fresh = Number(draft.fresh_norm_kg_per_ha_flush)
  if (!isWhole(draft.fresh_norm_kg_per_ha_flush) || fresh < 300 || fresh > 6000) errors.fresh_norm_kg_per_ha_flush = 'Nhập số nguyên từ 300 đến 6000.'
  const tolerance = Number(draft.norm_tolerance)
  if (draft.norm_tolerance.trim() === '' || !Number.isFinite(tolerance) || tolerance < 1 || tolerance > 3) errors.norm_tolerance = 'Nhập số từ 1.00 đến 3.00.'
  const percent = Number(draft.realert_percent)
  if (!isWhole(draft.realert_percent) || percent < 5 || percent > 100) errors.realert_extra = 'Nhập số nguyên phần trăm từ 5 đến 100.'
  if (Object.keys(errors).length > 0) return { errors }
  return {
    values: {
      grace_days: grace,
      fresh_norm_kg_per_ha_flush: fresh,
      norm_tolerance: Math.round(tolerance * 100) / 100,
      realert_extra: percent / 100,
    },
  }
}

const FIELD_LABELS: Record<ThresholdKey, string> = {
  grace_days: 'Số ngày chờ ghi nhật ký phun sau khi ứng thuốc',
  fresh_norm_kg_per_ha_flush: 'Định mức búp tươi (kg/ha/lứa)',
  norm_tolerance: 'Hệ số dung sai',
  realert_extra: 'Báo lại khi vượt thêm (%)',
}

const DRAFT_KEY: Record<ThresholdKey, keyof Draft> = {
  grace_days: 'grace_days',
  fresh_norm_kg_per_ha_flush: 'fresh_norm_kg_per_ha_flush',
  norm_tolerance: 'norm_tolerance',
  realert_extra: 'realert_percent',
}

const HINTS: Record<ThresholdKey, string> = {
  grace_days: 'Từ 3 đến 30 ngày.',
  fresh_norm_kg_per_ha_flush: 'Từ 300 đến 6000 kg mỗi ha mỗi lứa.',
  norm_tolerance: 'Từ 1.00 đến 3.00. Lượng búp cân vượt định mức nhân hệ số này mới báo.',
  realert_extra: 'Từ 5% đến 100%. Chỉ báo lại khi tổng vượt thêm tỉ lệ này so với lần báo trước.',
}

/** Manager edits the cross-check thresholds; officers see them read-only. The server's validation message shows under the form. */
export function CrossCheckThresholdsSection() {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<ThresholdKey, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(AGENT_CROSS_CHECK_URL)
      .then(async (res) => {
        if (!res.ok) throw new Error('load')
        const json = await res.json()
        const stored = (json?.data?.thresholds ?? {}) as Partial<CrossCheckThresholds>
        if (!cancelled) {
          setDraft(toDraft({ ...CROSS_CHECK_DEFAULTS, ...stored }))
          setCanEdit(json?.data?.can_edit === true)
        }
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const update = (key: keyof Draft, value: string) => {
    setDraft((current) => current && { ...current, [key]: value })
  }

  const save = async () => {
    if (!draft) return
    const parsed = parseDraft(draft)
    if ('errors' in parsed) {
      setErrors(parsed.errors)
      setFormError(null)
      return
    }
    setSaving(true)
    setErrors({})
    setFormError(null)
    try {
      const res = await fetch(AGENT_CROSS_CHECK_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.values),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFormError(json?.error?.message || SAVE_FAILED_MESSAGE)
        return
      }
      const saved = (json?.data?.thresholds ?? {}) as Partial<CrossCheckThresholds>
      setDraft(toDraft({ ...parsed.values, ...saved }))
      toast.success('Đã lưu ngưỡng đối soát')
    } catch {
      setFormError(SAVE_FAILED_MESSAGE)
    } finally {
      setSaving(false)
    }
  }

  if (loadFailed) {
    return (
      <section className={styles.section} aria-labelledby="cross-check-heading">
        <h2 id="cross-check-heading" className={styles.sectionTitle}>Ngưỡng đối soát</h2>
        <p role="alert" className={styles.error}>{LOAD_FAILED_MESSAGE}</p>
      </section>
    )
  }
  if (!draft) {
    return (
      <section className={styles.section} aria-labelledby="cross-check-heading">
        <h2 id="cross-check-heading" className={styles.sectionTitle}>Ngưỡng đối soát</h2>
        <p className={styles.note} role="status">Đang tải ngưỡng…</p>
      </section>
    )
  }

  const readOnly = !canEdit

  return (
    <section className={styles.section} aria-labelledby="cross-check-heading">
      <h2 id="cross-check-heading" className={styles.sectionTitle}>Ngưỡng đối soát</h2>
      {readOnly && <p className={styles.note}>Bạn đang xem ở chế độ chỉ đọc. Chỉ trưởng HTX sửa được ngưỡng.</p>}
      {(Object.keys(FIELD_LABELS) as ThresholdKey[]).map((key) => {
        const inputId = `cross-check-${key}`
        const hintId = `${inputId}-hint`
        const errorId = `${inputId}-error`
        const message = errors[key]
        const isFloat = key === 'norm_tolerance'
        return (
          <div key={key} className={styles.field}>
            <label htmlFor={inputId} className={styles.fieldLabel}>{FIELD_LABELS[key]}</label>
            <input
              id={inputId}
              className={styles.input}
              type="number"
              inputMode={isFloat ? 'decimal' : 'numeric'}
              step={isFloat ? '0.01' : '1'}
              min={isFloat ? '1.00' : undefined}
              max={isFloat ? '3.00' : undefined}
              value={draft[DRAFT_KEY[key]]}
              disabled={saving || readOnly}
              aria-invalid={message ? true : undefined}
              aria-describedby={message ? `${hintId} ${errorId}` : hintId}
              onChange={(e) => update(DRAFT_KEY[key], e.target.value)}
            />
            <span id={hintId} className={styles.share}>{HINTS[key]}</span>
            {message && <span id={errorId} className={styles.error}>{message}</span>}
          </div>
        )
      })}
      {formError && <p role="alert" className={styles.error}>{formError}</p>}
      {!readOnly && (
        <div className={styles.actions}>
          <Button variant="primary" onClick={save} isLoading={saving}>Lưu ngưỡng</Button>
        </div>
      )}
    </section>
  )
}
