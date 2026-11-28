// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Pill } from '@/components/ui/Pill'
import kit from '@/components/features/dashboard/page-kit.module.css'
import styles from '@/components/features/zalo/zalo.module.css'
import { ZALO_TEMPLATE_LABELS, type ZaloTemplate, type ZaloTemplateKey } from '@/lib/zalo/zalo-types'
import { JSON_HEADERS, zaloCall } from '@/lib/zalo/zalo-api'

const TEMPLATES_URL = '/api/platform/zalo/templates'
const TEMPLATE_ID = /^[0-9A-Za-z_-]{1,40}$/

/** One row per fixed template key, as typed. */
interface Draft {
  key: ZaloTemplateKey
  configured: boolean
  allowed: string[]
  zns: string
  params: string[]
}

const toDrafts = (list: ZaloTemplate[]): Draft[] =>
  list.map((t) => ({ key: t.template_key, configured: t.configured, allowed: t.allowed_params, zns: t.zns_template_id ?? '', params: t.params }))

export function ZaloTemplatesForm() {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    zaloCall<ZaloTemplate[]>(TEMPLATES_URL)
      .then((data) => {
        if (active) setDrafts(toDrafts(data))
      })
      .catch(() => {
        if (active) setFailed(true)
      })
      .finally(() => {
        if (active) setLoaded(true)
      })
    return () => {
      active = false
    }
  }, [])

  const patch = (key: ZaloTemplateKey, change: Partial<Draft>) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...change } : d)))

  const toggleParam = (draft: Draft, param: string, on: boolean) => {
    // The order of the allowed list is kept, whatever order the boxes were ticked in.
    patch(draft.key, { params: draft.allowed.filter((p) => (p === param ? on : draft.params.includes(p))) })
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const templates = drafts
      .filter((d) => d.zns.trim() !== '')
      .map((d) => ({ template_key: d.key, zns_template_id: d.zns.trim(), params: d.params }))
    if (templates.length === 0) {
      toast.error('Nhập ít nhất một mã mẫu ZNS.')
      return
    }
    if (templates.some((t) => !TEMPLATE_ID.test(t.zns_template_id))) {
      toast.error('Mã mẫu ZNS chỉ gồm chữ, số, dấu gạch ngang hoặc gạch dưới, tối đa 40 ký tự.')
      return
    }
    setBusy(true)
    try {
      setDrafts(toDrafts(await zaloCall<ZaloTemplate[]>(TEMPLATES_URL, { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ templates }) })))
      toast.success('Đã lưu mẫu tin Zalo.')
    } catch {
      toast.error('Không lưu được mẫu tin. Kiểm tra lại mã mẫu và tham số.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={kit.card} aria-labelledby="zalo-templates-title">
      <div className={styles.body}>
        <h2 id="zalo-templates-title" className={styles.title}>Mẫu tin ZNS</h2>
        {failed && <p role="alert" className={kit.error}>Không tải được mẫu tin Zalo.</p>}
        {!failed && !loaded && <p className={kit.state}>Đang tải...</p>}
        {!failed && loaded && (
          <form className={styles.form} onSubmit={save}>
            {drafts.map((d) => (
              <fieldset key={d.key} className={styles.fieldset}>
                <legend>
                  {ZALO_TEMPLATE_LABELS[d.key]} {!d.configured && <Pill tone="blue" size="sm">Chưa cấu hình</Pill>}
                </legend>
                <label className={styles.field}>
                  Mã mẫu ZNS
                  <input
                    className={styles.input}
                    value={d.zns}
                    onChange={(e) => patch(d.key, { zns: e.target.value })}
                    aria-label={`Mã mẫu ZNS: ${ZALO_TEMPLATE_LABELS[d.key]}`}
                  />
                </label>
                <fieldset className={styles.fieldset}>
                  <legend>Tham số</legend>
                  <div className={styles.checks}>
                    {d.allowed.map((param) => (
                      <label key={param} className={styles.check}>
                        <input
                          type="checkbox"
                          checked={d.params.includes(param)}
                          onChange={(e) => toggleParam(d, param, e.target.checked)}
                        />
                        {param}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </fieldset>
            ))}
            <div className={styles.actions}>
              <button type="submit" className={kit.primary} disabled={busy}>Lưu mẫu</button>
            </div>
          </form>
        )}
      </div>
    </section>
  )
}
