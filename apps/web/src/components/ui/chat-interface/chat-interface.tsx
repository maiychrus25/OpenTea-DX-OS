// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState, useRef, useEffect } from 'react'
import { ArrowDown, ArrowUp, PanelLeft, Square, SquarePen } from 'lucide-react'
import { ChatHistory } from './chat-history'
import { ChatMessage } from './chat-message'
import { useChat, type ChatType } from './use-chat'
import styles from './chat-interface.module.css'

interface ChatInterfaceProps {
  role: 'manager' | 'officer'
  chatType?: ChatType
  userName?: string
  /** Who is signed in, when that differs from the screen being shown. */
  userRole?: 'manager' | 'officer'
}

export function ChatInterface({ role, chatType: requestedType, userName, userRole = role }: ChatInterfaceProps) {
  const chatType = requestedType || (role === 'manager' ? 'market' : 'technical')
  const chat = useChat(chatType)
  const [inputValue, setInputValue] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const [showLatest, setShowLatest] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const drawerRef = useRef<HTMLDialogElement>(null)
  const composing = useRef(false)
  const following = useRef(true)
  const empty = !chat.messages.length && !chat.historyLoading && !chat.historyError
  const title = chatType === 'market' ? 'Trợ lý Thị trường' : 'Trợ lý Kỹ thuật'
  const otherAssistant = userRole !== 'officer' ? undefined : chatType === 'market'
    ? { label: 'Trợ lý Kỹ thuật', href: '/officer/chat' }
    : { label: 'Trợ lý Thị trường', href: '/officer/assistant' }

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

  useEffect(() => {
    const media = window.matchMedia('(min-width: 801px)')
    const closeOnDesktop = () => { if (media.matches) drawerRef.current?.close() }
    media.addEventListener('change', closeOnDesktop)
    return () => media.removeEventListener('change', closeOnDesktop)
  }, [])

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
  const sidebar = (drawer: boolean) => <ChatHistory
    user={{ name: userName || (userRole === 'manager' ? 'Trưởng HTX' : 'Cán bộ KT'), role: userRole }}
    otherAssistant={otherAssistant} drawer={drawer} fresh={empty}
    sessions={chat.sessions} sessionId={chat.sessionId}
    loading={chat.sessionsLoading} error={chat.sessionsError} onRetry={() => void chat.fetchSessions()}
    onNew={onNew} onSelect={onSelect} onClose={() => drawer ? drawerRef.current?.close() : setCollapsed(true)} />

  return (
    <div className={styles.chatLayout} data-chat-workspace>
      <aside id="chat-history" className={`${styles.chatHistory} ${styles.desktopHistory}`} hidden={collapsed} aria-label="Lịch sử trò chuyện">
        {sidebar(false)}
      </aside>
      <dialog ref={drawerRef} className={styles.historyDrawer} aria-label="Lịch sử trò chuyện"
        onClick={event => { if (event.target === event.currentTarget) drawerRef.current?.close() }}>
        <div className={styles.drawerContent}>{sidebar(true)}</div>
      </dialog>
      <section className={styles.chatMain} aria-label={title}>
        <header className={styles.chatHeader}>
          {collapsed && <span className={styles.desktopToggle}>
            <button className={styles.iconButton} onClick={() => setCollapsed(false)} aria-label="Mở lịch sử"><PanelLeft size={19} /></button>
            <button className={styles.iconButton} onClick={onNew} aria-label="Trò chuyện mới"><SquarePen size={19} /></button>
          </span>}
          <button className={`${styles.iconButton} ${styles.mobileToggle}`} onClick={() => drawerRef.current?.showModal()}
            aria-label="Mở lịch sử" aria-haspopup="dialog"><PanelLeft size={19} /></button>
          <h1 className={styles.headerTitle}>{title}</h1>
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
              <h2>Hôm nay bạn đang nghĩ gì?</h2>
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
              <textarea ref={inputRef} className={styles.input} placeholder="Hỏi trợ lý…" aria-label="Câu hỏi"
                rows={1} value={inputValue} onChange={event => setInputValue(event.target.value)} onKeyDown={onKeyDown}
                onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }}
                disabled={chat.historyLoading || !!chat.historyError} />
              <button className={styles.sendBtn} onClick={chat.streamingId ? chat.stop : send}
                disabled={!chat.streamingId && (!inputValue.trim() || chat.historyLoading || !!chat.historyError)}
                aria-label={chat.streamingId ? 'Dừng trả lời' : 'Gửi'}>
                {chat.streamingId ? <Square size={17} fill="currentColor" /> : <ArrowUp size={20} />}
              </button>
            </div>
            <p className={styles.disclaimer}>AI chỉ cung cấp thông tin tham khảo, không quyết định thay HTX.</p>
          </div>
        </div>
      </section>
    </div>
  )
}
