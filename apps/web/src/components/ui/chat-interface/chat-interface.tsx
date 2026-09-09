// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Plus, Send, Bot, MessageSquare, ExternalLink, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import styles from './chat-interface.module.css'
import { ChatMessage } from './mock-data'

interface ChatInterfaceProps {
  role: 'manager' | 'officer'
}

export function ChatInterface({ role }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sessions, setSessions] = useState<{ session_id: string; title: string }[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId, setSessionId] = useState(`chat-${Date.now()}`)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const isManager = role === 'manager'
  const chatType = isManager ? 'market' : 'technical'
  const title = isManager ? 'Trợ lý Thị trường' : 'Trợ lý Kỹ thuật'
  const subtitle = isManager 
    ? 'Phân tích từ USDA + WTO + Chợ đầu mối' 
    : 'Kiến thức canh tác + VietGAP + Bệnh cây'

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`/api/chatbot/sessions?type=${chatType}`)
      if (res.ok) {
        const data = await res.json()
        setSessions(data.data?.sessions || [])
      }
    } catch (e) {
      console.error('Failed to fetch sessions', e)
    }
  }, [chatType])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isLoading) return

    const userText = inputValue.trim()
    const newUserMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userText,
    }

    const isFirstMessage = messages.length === 0
    setMessages(prev => [...prev, newUserMsg])
    setInputValue('')
    setIsLoading(true)

    // Build history from previous messages (last 10)
    const history = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-10)
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    const botMsgId = `bot-${Date.now()}`

    try {
      const res = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          type: chatType,
          session_id: sessionId,
          history,
        }),
      })

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let fullText = ''
      let sources: string[] = []

      // Add empty bot message that we'll stream into
      setMessages(prev => [...prev, {
        id: botMsgId,
        role: 'assistant',
        content: '',
      }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n').filter(l => l.trim())

        for (const line of lines) {
          try {
            const data = JSON.parse(line)

            if (data.error) {
              fullText = data.message || 'AI đang gặp sự cố, vui lòng thử lại sau.'
              setMessages(prev => prev.map(m =>
                m.id === botMsgId ? { ...m, content: fullText } : m
              ))
              break
            }

            if (data.done) {
              sources = data.sources || []
              // Remove <think> blocks from displayed text
              const cleanText = fullText.replace(/<think>[\s\S]*?(<\/think>|$)/gi, '').trim()
              setMessages(prev => prev.map(m =>
                m.id === botMsgId ? { ...m, content: cleanText, sources } : m
              ))
            } else if (data.text) {
              fullText += data.text
              // Remove <think> blocks for display during streaming
              const displayText = fullText.replace(/<think>[\s\S]*?(<\/think>|$)/gi, '').trim()
              setMessages(prev => prev.map(m =>
                m.id === botMsgId ? { ...m, content: displayText } : m
              ))
            }
          } catch {
            // Skip non-JSON lines
          }
        }
      }
    } catch {
      setMessages(prev => [...prev, {
        id: botMsgId,
        role: 'assistant',
        content: 'Không thể kết nối tới AI. Vui lòng kiểm tra kết nối và thử lại.',
        sources: [],
      }])
    } finally {
      setIsLoading(false)
      // If this was the first message of a new session, refresh the sidebar
      if (isFirstMessage) {
        fetchSessions()
      }
    }
  }, [inputValue, isLoading, messages, chatType, sessionId, fetchSessions])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const startNewConversation = () => {
    setMessages([])
    setSessionId(`chat-${Date.now()}`)
  }

  const loadSession = async (id: string) => {
    if (id === sessionId || isLoading) return
    
    setSessionId(id)
    setMessages([])
    setIsLoading(true)

    try {
      const res = await fetch(`/api/chatbot?session_id=${id}&type=${chatType}`)
      if (res.ok) {
        const data = await res.json()
        if (data.data?.history) {
          const hist = data.data.history.map((m: any, i: number) => ({
            id: `hist-${i}`,
            role: m.role,
            content: m.content
          }))
          setMessages(hist)
        }
      }
    } catch (e) {
      console.error('Failed to load session history', e)
    } finally {
      setIsLoading(false)
    }
  }

  // Calculate chart max for percentage rendering
  const getChartMax = (data?: number[]) => {
    if (!data || data.length === 0) return 100
    return Math.max(...data) * 1.1 // Add 10% headroom
  }

  return (
    <div className={styles.chatLayout}>
      <aside className={styles.chatHistory}>
        <div className={styles.historyHeader}>
          <button className={styles.newChatBtn} onClick={startNewConversation}>
            <Plus size={18} />
            <span>Cuộc trò chuyện mới</span>
          </button>
        </div>
        <ul className={styles.historyList}>
          {sessions.length === 0 ? (
            <li className={styles.historyItem} style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic', textAlign: 'center', marginTop: '1rem' }}>
              Chưa có lịch sử trò chuyện
            </li>
          ) : (
            sessions.map((sess) => (
              <li 
                key={sess.session_id}
                className={`${styles.historyItem} ${sess.session_id === sessionId ? styles.active : ''}`}
                onClick={() => loadSession(sess.session_id)}
                title={sess.title}
              >
                <MessageSquare size={16} className={styles.iconInline} />
                {sess.title}
              </li>
            ))
          )}
        </ul>
      </aside>

      <main className={styles.chatMain}>
        <header className={styles.chatHeader}>
          <div className={styles.headerIcon}>
            <Bot size={24} />
          </div>
          <div>
            <h1 className={styles.headerTitle}>{title}</h1>
            <p className={styles.headerSubtitle}>{subtitle}</p>
          </div>
        </header>

        <div className={styles.messages}>
          {messages.length === 0 && (
            <div className={styles.emptyState}>
              Hãy đặt câu hỏi để bắt đầu...
            </div>
          )}
          
          {messages.map((msg) => (
            <div key={msg.id} className={`${styles.messageRow} ${msg.role === 'user' ? styles.messageRowUser : styles.messageRowBot}`}>
              <div className={msg.role === 'user' ? styles.userMessage : styles.botMessage}>
                {msg.role === 'user' ? (
                  msg.content || (isLoading ? '...' : '')
                ) : (
                  msg.content ? (
                    <div className={styles.markdownContent}>
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    isLoading ? '...' : ''
                  )
                )}
                
                {msg.chartData && msg.chartData.length > 0 && (
                  <div className={styles.miniChart}>
                    {msg.chartData.map((val, idx) => (
                      <div 
                        key={idx} 
                        className={styles.miniChartBar}
                        style={{ '--bar-height': `${(val / getChartMax(msg.chartData)) * 100}%` } as React.CSSProperties}
                        title={`${val}`}
                      />
                    ))}
                  </div>
                )}

                {msg.sources && msg.sources.length > 0 && (
                  <div className={styles.sourcesWrap}>
                    <span className={styles.sourceLabel}>Nguồn tham khảo:</span>
                    <ul className={styles.sourceList}>
                      {msg.sources.map((src, idx) => (
                        <li key={idx} className={styles.sourceItem}>
                          <ExternalLink size={12} />
                          {src}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className={`${styles.messageRow} ${styles.messageRowBot}`}>
              <div className={styles.botMessage}>
                <Loader2 size={18} className={styles.loadingSpinner} />
                <span>Đang suy nghĩ...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className={styles.composer}>
          <div className={styles.inputWrapper}>
            <textarea
              className={styles.input}
              placeholder="Nhập câu hỏi..."
              rows={1}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
            />
            <button 
              className={styles.sendBtn} 
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading}
              aria-label="Gửi"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
