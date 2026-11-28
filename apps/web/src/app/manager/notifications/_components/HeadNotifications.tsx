// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useState } from 'react'
import useSWR from 'swr'
import { ArrowLeft, Bell, CalendarDays, CheckCheck, ExternalLink, FileText, Volume2 } from 'lucide-react'
import { EmptyState, PageHeader, Pill } from '@/components/ui'
import { Pager, Sample, Tabs, pageOf } from '@/components/features/manager-web/parts'
import ui from '@/components/features/manager-web/kit.module.css'
import kit from '@/components/features/dashboard/page-kit.module.css'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import styles from './notifications.module.css'

interface Notice {
  id: string
  title: string
  detail: string
  tone: 'green' | 'amber' | 'blue' | 'neutral'
  created_at: string
  read: boolean
  link_url?: string | null
}

type View = 'all' | Notice['tone']

/** The server sorts notices by colour; these are the design's names for them. */
const GROUPS: Record<Notice['tone'], string> = { blue: 'Hệ thống', green: 'Hoạt động', amber: 'Cảnh báo', neutral: 'Khác' }

function ago(value: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000))
  if (minutes < 60) return `${minutes} phút trước`
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} giờ trước`
  return `${Math.round(minutes / 60 / 24)} ngày trước`
}

/** The head's notices: the list on the left, the chosen one on the right. */
export function HeadNotifications() {
  const { data, error, mutate } = useSWR<{ data: { notifications: Notice[]; unreadCount: number } }>(
    '/api/notifications?limit=100',
    (url: string) => fetchJson<{ data: { notifications: Notice[]; unreadCount: number } }>(url),
    { refreshInterval: 30000 },
  )
  const [view, setView] = useState<View>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [chosenId, setChosenId] = useState('')
  const [speaking, setSpeaking] = useState(false)
  const [message, setMessage] = useState('')

  const all = data?.data.notifications ?? []
  const needle = search.trim().toLocaleLowerCase('vi')
  const listed = all.filter((n) => (view === 'all' || n.tone === view) && (!needle || `${n.title} ${n.detail}`.toLocaleLowerCase('vi').includes(needle)))
  const paged = pageOf(listed, page, 6)
  const chosen = listed.find((n) => n.id === chosenId) ?? null
  const count = (tone: Notice['tone']) => all.filter((n) => n.tone === tone).length

  async function mark(body: object) {
    const res = await fetch('/api/notifications', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) setMessage('Không đánh dấu được. Hãy thử lại.')
    void mutate()
  }

  const open = (notice: Notice) => {
    setChosenId(notice.id)
    if (!notice.read) void mark({ id: notice.id, action: 'mark-read' })
  }

  async function listen(notice: Notice) {
    setSpeaking(true)
    setMessage('')
    try {
      const res = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `${notice.title}. ${notice.detail}` }) })
      if (!res.ok) throw new Error('tts')
      const url = URL.createObjectURL(await res.blob())
      const audio = new Audio(url)
      audio.onended = () => { URL.revokeObjectURL(url); setSpeaking(false) }
      await audio.play()
    } catch {
      setMessage('Dịch vụ đọc thông báo hiện không khả dụng.')
      setSpeaking(false)
    }
  }

  return (
    <div className={kit.page}>
      <PageHeader
        icon={<Bell size={28} />}
        title="Thông báo"
        description="Cập nhật tin tức, hoạt động và thông tin quan trọng từ HTX."
        actions={<button type="button" className={kit.secondary} disabled={!data?.data.unreadCount} onClick={() => mark({ action: 'mark-all-read' })}><CheckCheck size={16} aria-hidden="true" />Đánh dấu tất cả đã đọc</button>}
      />
      {message && <p role="alert" className={kit.error}>{message}</p>}
      <div className={ui.bar}>
        <Tabs<View>
          label="Nhóm thông báo"
          value={view}
          onChange={(key) => { setView(key); setPage(1) }}
          items={[{ key: 'all', label: `Tất cả (${all.length})` }, ...(Object.keys(GROUPS) as Notice['tone'][]).map((tone) => ({ key: tone, label: `${GROUPS[tone]} (${count(tone)})` }))]}
        />
        <input type="search" className={`${ui.control} ${ui.grow}`} aria-label="Tìm thông báo" placeholder="Tìm kiếm thông báo..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
      </div>

      <div className={styles.columns}>
        <section className={kit.card} aria-label="Danh sách thông báo">
          {error ? <div className={kit.state}>{LOAD_FAILED_MESSAGE}</div> : !data ? <div className={kit.state}>Đang tải thông báo...</div> : listed.length === 0 ? <EmptyState icon={<Bell />} title="Chưa có thông báo nào" /> : (
            <>
              <ul className={styles.list}>
                {paged.rows.map((n) => (
                  <li key={n.id}>
                    <button type="button" aria-pressed={n.id === chosen?.id} onClick={() => open(n)}>
                      <span><strong>{n.title}</strong><small>{ago(n.created_at)}</small></span>
                      <span><span>{n.detail}</span>{!n.read && <i aria-label="Chưa đọc" />}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <Pager current={paged.current} pages={paged.pages} start={paged.start} shown={paged.rows.length} total={listed.length} unit="thông báo" onPage={setPage} />
            </>
          )}
        </section>

        <section className={`${kit.card} ${styles.detail}`} aria-label="Nội dung thông báo">
          {!chosen ? <EmptyState icon={<Bell />} title="Chọn một thông báo để xem." /> : (
            <>
              <h2>{chosen.title}</h2>
              <p><Pill tone={chosen.tone}>{GROUPS[chosen.tone]}</Pill></p>
              <p className={styles.when}><CalendarDays size={15} aria-hidden="true" />{new Date(chosen.created_at).toLocaleString('vi-VN')}</p>
              <p className={styles.body}>{chosen.detail}</p>
              <div className={styles.file}>
                <strong>Tệp đính kèm <Sample /></strong>
                <span><FileText size={16} aria-hidden="true" />Thông báo chưa hỗ trợ tệp đính kèm.</span>
              </div>
              <div className={ui.rowActions}>
                <button type="button" className={ui.small} onClick={() => setChosenId('')}><ArrowLeft size={14} aria-hidden="true" />Quay lại</button>
                <button type="button" className={ui.small} disabled={speaking} onClick={() => listen(chosen)}><Volume2 size={14} aria-hidden="true" />Đọc thông báo</button>
                {chosen.link_url && <a className={`${ui.small} ${ui.solid}`} href={chosen.link_url}><ExternalLink size={14} aria-hidden="true" />Xem chi tiết</a>}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
