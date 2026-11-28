// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { EmptyState, Panel } from '@/components/ui'
import { fetchJson } from '@/lib/api/fetch-json'
import layout from '@/components/features/dashboard/dashboard.module.css'

interface Notice { id: string; title: string; detail: string; created_at: string }

/** The newest notices of the cooperative. */
export function HeadNotices() {
  const [notices, setNotices] = useState<Notice[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    fetchJson<{ data?: { notifications?: Notice[] } }>('/api/notifications?limit=3')
      .then((body) => setNotices(body.data?.notifications ?? []))
      .catch(() => setFailed(true))
  }, [])

  return (
    <Panel title="Bản tin & thông báo" href="/manager/notifications">
      {failed ? (
        <EmptyState icon={<Bell />} title="Chưa tải được thông báo" />
      ) : notices === null ? null : notices.length === 0 ? (
        <EmptyState icon={<Bell />} title="Chưa có thông báo" />
      ) : (
        <ul className={layout.list}>
          {notices.map((notice) => (
            <li key={notice.id} className={layout.row}>
              <span className={layout.rowMain}><strong>{notice.title}</strong><small>{notice.detail}</small></span>
              <small>{new Date(notice.created_at).toLocaleDateString('vi-VN')}</small>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
