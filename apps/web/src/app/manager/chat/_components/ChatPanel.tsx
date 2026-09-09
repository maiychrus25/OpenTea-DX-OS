// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Bot, User, Loader2, AlertCircle, BookOpen } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import styles from './chat-panel.module.css'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
  isStreaming?: boolean
  isError?: boolean
}

interface ChatPanelProps {
  userId: string
  userName: string
}

export function ChatPanel({ userId, userName }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId] = useState(() => `chat-${userId}-${Date.now()}`)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
    }

    const assistantMsg: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      isStreaming: true,
    }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
    setIsLoading(true)

    try {
      const history = messages
        .filter(m => !m.isError)
        .map(m => ({ role: m.role, content: m.content }))

      const res = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          session_id: sessionId,
          history: history.slice(-10),
        }),
      })

      if (!res.ok) {
        const errorCode = res.status === 503 ? 'AI_UNAVAILABLE' : 'ERROR'
        setMessages(prev => prev.map(m =>
          m.id === assistantMsg.id
            ? {
                ...m,
                content: errorCode === 'AI_UNAVAILABLE'
                  ? 'Dịch vụ AI hiện không khả dụng. Vui lòng thử lại sau hoặc xem bản tin thị trường.'
                  : 'Đã xảy ra lỗi. Vui lòng thử lại.',
                isStreaming: false,
                isError: true,
              }
            : m
        ))
        return
      }

      const reader = res.body?.getReader()
      if (!reader) return

      const decoder = new TextDecoder()
      let fullText = ''
      let sources: string[] = []
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const data = JSON.parse(line)

            if (data.error) {
              setMessages(prev => prev.map(m =>
                m.id === assistantMsg.id
                  ? { ...m, content: data.message || 'Lỗi không xác định', isStreaming: false, isError: true }
                  : m
              ))
              return
            }

            if (data.done) {
              sources = data.sources || []
            } else if (data.text) {
              fullText += data.text
              setMessages(prev => prev.map(m =>
                m.id === assistantMsg.id ? { ...m, content: fullText } : m
              ))
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }

      // Finalize message with sources
      setMessages(prev => prev.map(m =>
        m.id === assistantMsg.id
          ? { ...m, content: fullText, isStreaming: false, sources }
          : m
      ))
    } catch {
      setMessages(prev => prev.map(m =>
        m.id === assistantMsg.id
          ? { ...m, content: 'Lỗi kết nối. Vui lòng kiểm tra mạng và thử lại.', isStreaming: false, isError: true }
          : m
      ))
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Bot size={24} className={styles.botIcon} />
          <div>
            <h1 className={styles.title}>Trợ lý Thị trường</h1>
            <p className={styles.subtitle}>Hỏi đáp thông tin thị trường nông sản — dữ liệu có trích nguồn</p>
          </div>
        </div>
        <div className={styles.aiNote}>
          <AlertCircle size={14} />
          <span>AI chỉ cung cấp thông tin tham khảo, không đưa ra quyết định thay HTX</span>
        </div>
      </header>

      <div className={styles.messagesArea}>
        {messages.length === 0 && (
          <div className={styles.emptyState}>
            <Bot size={48} className={styles.emptyIcon} />
            <h2 className={styles.emptyTitle}>Xin chào {userName}!</h2>
            <p className={styles.emptyText}>
              Tôi có thể giúp bạn tìm hiểu về giá cả, xu hướng thị trường nông sản.
              Mọi thông tin đều có trích dẫn nguồn.
            </p>
            <div className={styles.suggestions}>
              {[
                'Giá gạo xuất khẩu tuần này thế nào?',
                'So sánh giá lúa tháng 7 và tháng 8',
                'Thị trường nông sản Đông Nam Á có gì đáng chú ý?',
              ].map((s, i) => (
                <button
                  key={i}
                  className={styles.suggestion}
                  onClick={() => { setInput(s); inputRef.current?.focus() }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div
            key={msg.id}
            className={`${styles.message} ${msg.role === 'user' ? styles.userMessage : styles.assistantMessage} ${msg.isError ? styles.errorMessage : ''}`}
          >
            <div className={styles.messageAvatar}>
              {msg.role === 'user' ? <User size={18} /> : <Bot size={18} />}
            </div>
            <div className={styles.messageContent}>
              <div className={styles.messageText}>
                {msg.content ? (
                  <div className={styles.markdownContent}>
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                      {msg.content.replace(/<think>[\s\S]*?(<\/think>|$)/gi, '').trim()}
                    </ReactMarkdown>
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '11px', color: 'var(--color-primary)' }}>
                      DEBUG: {JSON.stringify(msg.content)}
                    </pre>
                  </div>
                ) : (
                  msg.isStreaming && <Loader2 size={16} className={styles.spin} />
                )}
              </div>
              {msg.isStreaming && msg.content && (
                <span className={styles.cursor}>▊</span>
              )}
              {msg.sources && msg.sources.length > 0 && !msg.isStreaming && (
                <div className={styles.sources}>
                  <BookOpen size={14} />
                  <span>Nguồn: {msg.sources.join(', ')}</span>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className={styles.inputArea}>
        <div className={styles.inputWrap}>
          <textarea
            ref={inputRef}
            className={styles.input}
            placeholder="Hỏi về thị trường nông sản..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={isLoading}
          />
          <button
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            aria-label="Gửi tin nhắn"
          >
            {isLoading ? <Loader2 size={18} className={styles.spin} /> : <Send size={18} />}
          </button>
        </div>
        <p className={styles.disclaimer}>
          AI có thể đưa ra thông tin không chính xác. Luôn kiểm tra lại với nguồn gốc.
        </p>
      </div>
    </div>
  )
}
