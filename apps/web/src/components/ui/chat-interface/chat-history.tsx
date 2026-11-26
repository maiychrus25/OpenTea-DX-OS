// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeftRight, LayoutDashboard, PanelLeft, Search, SquarePen, X } from 'lucide-react'
import type { ChatSession } from './use-chat'
import styles from './chat-interface.module.css'

export interface ChatUser {
  name: string
  role: 'manager' | 'officer'
}

interface Props {
  user: ChatUser
  otherAssistant?: { label: string; href: string }
  sessions: ChatSession[]
  sessionId: string
  fresh: boolean
  loading: boolean
  error: string
  drawer?: boolean
  onRetry: () => void
  onNew: () => void
  onSelect: (id: string) => void
  onClose: () => void
}

const initials = (name: string) => name.split(/\s+/).filter(word => word && word[0].toLowerCase() !== word[0].toUpperCase()).slice(-2).map(word => word[0]).join('').toUpperCase()

/** The only sidebar on the chat screens: brand, shortcuts, recent conversations and the signed-in user. */
export function ChatHistory({ user, otherAssistant, sessions, sessionId, fresh, loading, error, drawer, onRetry, onNew, onSelect, onClose }: Props) {
  const [query, setQuery] = useState<string | null>(null)
  const needle = (query || '').trim().toLocaleLowerCase('vi')
  const shown = needle ? sessions.filter(session => session.title.toLocaleLowerCase('vi').includes(needle)) : sessions

  return <>
    <div className={styles.brandRow}>
      <strong className={styles.brand}>OpenTea</strong>
      <button className={styles.iconButton} aria-label="Tìm kiếm trò chuyện" aria-expanded={query !== null}
        onClick={() => setQuery(query === null ? '' : null)}><Search size={19} /></button>
      <button className={styles.iconButton} aria-label={drawer ? 'Đóng lịch sử' : 'Thu gọn lịch sử'} onClick={onClose}>
        {drawer ? <X size={20} /> : <PanelLeft size={19} />}
      </button>
    </div>
    {query !== null && <input className={styles.searchInput} type="search" autoFocus value={query}
      aria-label="Tìm trong lịch sử" placeholder="Tìm trong lịch sử" onChange={event => setQuery(event.target.value)} />}
    <nav className={styles.shortcuts} aria-label="Lối tắt">
      <button className={`${styles.sideRow} ${fresh ? styles.active : ''}`} onClick={onNew}><SquarePen size={18} />Trò chuyện mới</button>
      <Link className={styles.sideRow} href={`/${user.role}/dashboard`}><LayoutDashboard size={18} />Về Tổng quan</Link>
      {otherAssistant && <Link className={styles.sideRow} href={otherAssistant.href}><ArrowLeftRight size={18} />{otherAssistant.label}</Link>}
    </nav>
    <div className={styles.historyScroll}>
      <h2 className={styles.sectionLabel}>Gần đây</h2>
      {error ? <div className={styles.historyStatus} role="alert">{error}<button onClick={onRetry}>Thử lại</button></div>
        : loading && !sessions.length ? <p className={styles.historyStatus} role="status">Đang tải lịch sử...</p>
          : !sessions.length ? <p className={styles.historyStatus}>Chưa có lịch sử trò chuyện</p>
            : !shown.length ? <p className={styles.historyStatus}>Không tìm thấy cuộc trò chuyện</p> : null}
      <ul className={styles.historyList}>
        {shown.map(session => <li key={session.session_id}>
          <button className={`${styles.sideRow} ${session.session_id === sessionId ? styles.active : ''}`}
            aria-current={session.session_id === sessionId ? 'true' : undefined}
            onClick={() => onSelect(session.session_id)} title={session.title}>
            <span>{session.title}</span>
          </button>
        </li>)}
      </ul>
    </div>
    <div className={styles.userRow}>
      <span className={styles.userAvatar} aria-hidden="true">{initials(user.name)}</span>
      <span className={styles.userText}>
        <strong>{user.name}</strong>
        <small>{user.role === 'manager' ? 'Trưởng HTX' : 'Cán bộ KT'}</small>
      </span>
    </div>
  </>
}
