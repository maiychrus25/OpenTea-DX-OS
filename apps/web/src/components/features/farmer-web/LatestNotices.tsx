// SPDX-License-Identifier: MIT
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React from 'react'
import useSWR from 'swr'
import { Bell } from 'lucide-react'
import kit from './kit.module.css'

interface Notice { id: string; title: string; detail: string; tone: 'green' | 'amber' | 'blue' | 'neutral'; created_at: string; read: boolean }

const TONE = { green: 'soft', amber: 'amber', blue: 'in', neutral: 'mu' } as const

/** The newest notices beside the bulletin; the full list is the notifications tab. */
export function LatestNotices({ onShowAll }: { onShowAll: () => void }) {
  const { data } = useSWR<{ data?: { notifications?: Notice[] } }>('/api/notifications?limit=4', (url: string) => fetch(url).then(res => res.json()))
  const notices = data?.data?.notifications ?? []

  return (
    <section className={kit.pn} style={{ flex: '1 1 320px' }} aria-label="Thông báo mới">
      <div className={kit.ph}>
        <h2>Thông báo mới</h2>
        <button type="button" onClick={onShowAll} style={{ border: 0, background: 'none', padding: 0, font: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--color-primary)', cursor: 'pointer' }}>Xem hết</button>
      </div>
      {notices.length === 0 ? (
        <p className={kit.muted} style={{ margin: 0, padding: 18, fontSize: 13.5 }}>Chưa có thông báo nào.</p>
      ) : (
        <ul className={kit.list}>
          {notices.map(notice => (
            <li key={notice.id} className={kit.row} style={{ alignItems: 'flex-start', background: notice.read ? undefined : 'var(--color-surface-sunken)' }}>
              <span className={`${kit.ico} ${kit[TONE[notice.tone] ?? 'mu']}`} style={{ width: 38, height: 38 }}><Bell size={18} aria-hidden="true" /></span>
              <span className={kit.grow} style={{ lineHeight: 1.45 }}>
                <strong>{notice.title}</strong><br />
                <span className={kit.muted}>{notice.detail} · {new Date(notice.created_at).toLocaleDateString('vi-VN')}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
