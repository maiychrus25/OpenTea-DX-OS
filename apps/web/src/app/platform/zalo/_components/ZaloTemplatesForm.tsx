// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import kit from '@/components/features/dashboard/page-kit.module.css'
import formStyles from '../../_components/platform.module.css'
import styles from '@/components/features/zalo/zalo.module.css'
import type { ZaloTemplate } from '@/lib/zalo/zalo-types'

interface TemplateDraft {
  template_key: string
  zns_template_id: string
  params: string
}

const toDraft = (t: ZaloTemplate): TemplateDraft => ({
  template_key: t.template_key,
  zns_template_id: t.zns_template_id,
  params: t.params.join(', '),
})

const splitParams = (text: string) => text.split(',').map((p) => p.trim()).filter(Boolean)

export function ZaloTemplatesForm() {
  const [rows, setRows] = useState<TemplateDraft[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    fetch('/api/platform/zalo/templates')
      .then(async (res) => {
        if (!res.ok) throw new Error('load')
        const body = (await res.json()) as { templates: ZaloTemplate[] }
        if (active) setRows(body.templates.map(toDraft))
      })
      .catch(() => toast.error('Không tải được mẫu tin Zalo.'))
      .finally(() => {
        if (active) setLoaded(true)
      })
    return () => {
      active = false
    }
  }, [])

  const patch = (index: number, change: Partial<TemplateDraft>) =>
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...change } : row)))

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const templates = rows.map((r) => ({
      template_key: r.template_key.trim(),
      zns_template_id: r.zns_template_id.trim(),
      params: splitParams(r.params),
    }))
    if (templates.some((t) => !t.template_key || !t.zns_template_id)) {
      toast.error('Mỗi mẫu cần có mã mẫu và ID mẫu ZNS.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/platform/zalo/templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templates }),
      })
      if (!res.ok) throw new Error('save')
      toast.success('Đã lưu mẫu tin Zalo.')
    } catch {
      toast.error('Không lưu được mẫu tin. Kiểm tra lại mã mẫu và ID mẫu ZNS.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={kit.card} aria-labelledby="zalo-templates-title">
      <div className={styles.body}>
        <h2 id="zalo-templates-title" className={styles.title}>Mẫu tin ZNS</h2>
        {!loaded && <p className={kit.state}>Đang tải...</p>}
        {loaded && rows.length === 0 && <p className={kit.state}>Chưa có mẫu tin nào.</p>}
        <form className={formStyles.form} onSubmit={save}>
          {rows.map((row, index) => (
            <fieldset key={index}>
              <legend>Mẫu {index + 1}</legend>
              <label>
                Mã mẫu
                <input value={row.template_key} onChange={(e) => patch(index, { template_key: e.target.value })} aria-label={`Mã mẫu ${index + 1}`} />
              </label>
              <label>
                ID mẫu ZNS
                <input value={row.zns_template_id} onChange={(e) => patch(index, { zns_template_id: e.target.value })} aria-label={`ID mẫu ZNS ${index + 1}`} />
              </label>
              <label>
                Tham số (cách nhau bằng dấu phẩy)
                <input value={row.params} onChange={(e) => patch(index, { params: e.target.value })} aria-label={`Tham số ${index + 1}`} />
              </label>
              <div className={styles.actions}>
                <button type="button" className={kit.dangerButton} onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}>
                  Xoá mẫu {index + 1}
                </button>
              </div>
            </fieldset>
          ))}
          <div className={styles.actions}>
            <button type="button" className={kit.secondary} onClick={() => setRows((prev) => [...prev, { template_key: '', zns_template_id: '', params: '' }])}>
              Thêm mẫu
            </button>
            <button type="submit" className={kit.primary} disabled={busy || !loaded}>Lưu mẫu</button>
          </div>
        </form>
      </div>
    </section>
  )
}
