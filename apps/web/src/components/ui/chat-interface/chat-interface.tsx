// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState, useRef, useEffect } from 'react'
import { ArrowDown, ArrowUp, History, Square, SquarePen } from 'lucide-react'
import { ChatHistory } from './chat-history'
import { ChatMessage } from './chat-message'
import { useChat, type ChatType } from './use-chat'
import styles from './chat-interface.module.css'

interface ChatInterfaceProps {
  role: 'manager' | 'officer' | 'farmer'
  chatType?: ChatType
  /** Why this role cannot ask yet; the composer is then off. */
  closedNote?: string
  /** A panel beside the conversation, with the past conversations it can open. */
  aside?: (history: { sessions: { session_id: string; title: string }[]; open: (id: string) => void }) => React.ReactNode
}

export function ChatInterface({ role, chatType: requestedType, closedNote, aside }: ChatInterfaceProps) {
  const chatType = requestedType || (role === 'manager' ? 'market' : 'technical')
  const chat = useChat(chatType)
  const [inputValue, setInputValue] = useState('')
  const [showLatest, setShowLatest] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const drawerRef = useRef<HTMLDialogElement>(null)
  const composing = useRef(false)
  const following = useRef(true)
  const empty = !chat.messages.length && !chat.historyLoading && !chat.historyError
  const title = chatType === 'market' ? 'Trợ lý Thị trường' : 'Trợ lý Kỹ thuật'
  useEffect(() => {
    const input = inputRef.current
    if (input) {
      input.style.height = 'auto'
      input.style.height = `${Math.min(input.scrollHeight, 200)}px`
    }
  }, [inputValue])

  useEffect(() => {
    if (following.current && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [chat.messages, chat.historyLoading])

  const resetView = () => {
    following.current = true
    setShowLatest(false)
    setInputValue('')
    drawerRef.current?.close()
    inputRef.current?.focus()
  }
  const onNew = () => { chat.startNew(); resetView() }
  const onSelect = (id: string) => { void chat.loadSession(id); resetView() }
  const send = () => {
    if (!inputValue.trim() || chat.streamingId || chat.historyLoading || chat.historyError || composing.current) return
    void chat.send(inputValue)
    setInputValue('')
    inputRef.current?.focus()
  }
  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !composing.current && !event.nativeEvent.isComposing && event.keyCode !== 229) {
      event.preventDefault()
      send()
    }
  }
  return (
    <div className={styles.chatLayout} data-chat-workspace={aside ? undefined : true} data-aside={aside ? true : undefined}>
      <dialog ref={drawerRef} className={styles.historyDrawer} aria-label="Lịch sử trò chuyện"
        onClick={event => { if (event.target === event.currentTarget) drawerRef.current?.close() }}>
        <div className={styles.drawerContent}>
          <ChatHistory sessions={chat.sessions} sessionId={chat.sessionId} loading={chat.sessionsLoading}
            error={chat.sessionsError} onRetry={() => void chat.fetchSessions()} onSelect={onSelect}
            onClose={() => drawerRef.current?.close()} />
        </div>
      </dialog>
      <section className={styles.chatMain} aria-label={title}>
        <header className={styles.chatHeader}>
          <h1 className={styles.srOnly}>{title}</h1>
          <div className={styles.headerActions}>
            <button className={styles.headerButton} onClick={() => drawerRef.current?.showModal()} aria-haspopup="dialog">
              <History size={17} aria-hidden="true" />Lịch sử
            </button>
            <button className={styles.headerButton} onClick={onNew}>
              <SquarePen size={17} aria-hidden="true" />Trò chuyện mới
            </button>
          </div>
        </header>
        <div className={`${styles.conversation} ${empty ? styles.emptyConversation : ''}`}>
          <div ref={listRef} className={styles.messages} role="region" aria-label="Tin nhắn" tabIndex={0}
            onScroll={() => {
              const list = listRef.current
              if (!list) return
              following.current = list.scrollHeight - list.scrollTop - list.clientHeight < 96
              setShowLatest(!following.current)
            }}>
            {empty ? <div className={styles.emptyState}>
              {closedNote ? <p role="status">{closedNote}</p> : <h2>Hôm nay bạn đang nghĩ gì?</h2>}
            </div> : <div className={styles.messageColumn}>
              {chat.historyLoading && <p role="status" className={styles.historyStatus}>Đang tải cuộc trò chuyện...</p>}
              {chat.historyError && <p role="alert" className={styles.errorMessage}>{chat.historyError}</p>}
              {chat.messages.map(message => <ChatMessage key={message.id} message={message} streaming={chat.streamingId === message.id} />)}
            </div>}
          </div>
          <div className={styles.composer}>
            {showLatest && <button className={styles.jumpButton} onClick={() => {
              following.current = true
              setShowLatest(false)
              listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
            }}><ArrowDown size={16} /> Đến tin nhắn mới nhất</button>}
            <div className={styles.inputWrapper}>
              <textarea ref={inputRef} className={styles.input} placeholder={closedNote ? 'Chatbot chưa mở' : 'Hỏi trợ lý…'} aria-label="Câu hỏi"
                rows={1} value={inputValue} onChange={event => setInputValue(event.target.value)} onKeyDown={onKeyDown}
                onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }}
                disabled={!!closedNote || chat.historyLoading || !!chat.historyError} />
              <button className={styles.sendBtn} onClick={chat.streamingId ? chat.stop : send}
                disabled={!!closedNote || (!chat.streamingId && (!inputValue.trim() || chat.historyLoading || !!chat.historyError))}
                aria-label={chat.streamingId ? 'Dừng trả lời' : 'Gửi'}>
                {chat.streamingId ? <Square size={17} fill="currentColor" /> : <ArrowUp size={20} />}
              </button>
            </div>
            <p className={styles.disclaimer}>AI chỉ cung cấp thông tin tham khảo, không quyết định thay HTX.</p>
          </div>
        </div>
      </section>
      {aside?.({ sessions: chat.sessions, open: onSelect })}
    </div>
  )
}
