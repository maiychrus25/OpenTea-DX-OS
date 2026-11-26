// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { useState } from 'react'
import { Search, X } from 'lucide-react'
import type { ChatSession } from './use-chat'
import styles from './chat-interface.module.css'

interface Props {
  sessions: ChatSession[]
  sessionId: string
  loading: boolean
  error: string
  onRetry: () => void
  onSelect: (id: string) => void
  onClose: () => void
}

/** Past conversations, with a filter over their titles. */
export function ChatHistory({ sessions, sessionId, loading, error, onRetry, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLocaleLowerCase('vi')
  const shown = needle ? sessions.filter(session => session.title.toLocaleLowerCase('vi').includes(needle)) : sessions

  return <>
    <div className={styles.drawerHeading}>
      <h2>Lịch sử trò chuyện</h2>
      <button className={styles.iconButton} aria-label="Đóng lịch sử" onClick={onClose}><X size={20} /></button>
    </div>
    <label className={styles.searchBox}>
      <Search size={16} aria-hidden="true" />
      <input type="search" value={query} aria-label="Tìm trong lịch sử" placeholder="Tìm trong lịch sử"
        onChange={event => setQuery(event.target.value)} />
    </label>
    <div className={styles.historyScroll}>
      {error ? <div className={styles.historyStatus} role="alert">{error}<button onClick={onRetry}>Thử lại</button></div>
        : loading && !sessions.length ? <p className={styles.historyStatus} role="status">Đang tải lịch sử...</p>
          : !sessions.length ? <p className={styles.historyStatus}>Chưa có lịch sử trò chuyện</p>
            : !shown.length ? <p className={styles.historyStatus}>Không tìm thấy cuộc trò chuyện</p> : null}
      <ul className={styles.historyList}>
        {shown.map(session => <li key={session.session_id}>
          <button className={`${styles.historyItem} ${session.session_id === sessionId ? styles.active : ''}`}
            aria-current={session.session_id === sessionId ? 'true' : undefined}
            onClick={() => onSelect(session.session_id)} title={session.title}>
            {session.title}
          </button>
        </li>)}
      </ul>
    </div>
  </>
}
