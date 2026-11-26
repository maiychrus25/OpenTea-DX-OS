// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { MessageSquare, Plus } from 'lucide-react'
import type { ChatSession } from './use-chat'
import styles from './chat-interface.module.css'

interface Props {
  sessions: ChatSession[]
  sessionId: string
  loading: boolean
  error: string
  onRetry: () => void
  onNew: () => void
  onSelect: (id: string) => void
}

export function ChatHistory({ sessions, sessionId, loading, error, onRetry, onNew, onSelect }: Props) {
  const groups = new Map<string, ChatSession[]>()
  for (const session of sessions) {
    const date = session.updated_at ? new Date(session.updated_at) : null
    const label = date && !Number.isNaN(date.getTime())
      ? date.toLocaleDateString('vi-VN', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Cuộc trò chuyện'
    groups.set(label, [...(groups.get(label) || []), session])
  }

  return <>
    <div className={styles.historyHeader}>
      <button className={styles.newChatBtn} onClick={onNew}><Plus size={18} /><span>Cuộc trò chuyện mới</span></button>
    </div>
    <div className={styles.historyScroll}>
      {error ? <div className={styles.historyStatus} role="alert">{error}<button onClick={onRetry}>Thử lại</button></div>
        : loading && !sessions.length ? <p className={styles.historyStatus} role="status">Đang tải lịch sử...</p>
          : !sessions.length ? <p className={styles.historyStatus}>Chưa có lịch sử trò chuyện</p> : null}
      {Array.from(groups, ([label, items]) => <section key={label}>
        <h2 className={styles.historyDate}>{label}</h2>
        <ul className={styles.historyList}>
          {items.map(session => <li key={session.session_id}>
            <button className={`${styles.historyItem} ${session.session_id === sessionId ? styles.active : ''}`}
              aria-current={session.session_id === sessionId ? 'true' : undefined}
              onClick={() => onSelect(session.session_id)} title={session.title}>
              <MessageSquare size={16} aria-hidden="true" /><span>{session.title}</span>
            </button>
          </li>)}
        </ul>
      </section>)}
    </div>
  </>
}
