// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Plus, Send, Bot, MessageSquare, ExternalLink } from 'lucide-react'
import styles from './chat-interface.module.css'
import { ChatMessage, mockConversations } from './mock-data'

interface ChatInterfaceProps {
  role: 'manager' | 'officer'
}

export function ChatInterface({ role }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(mockConversations)
  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const isManager = role === 'manager'
  const title = isManager ? 'Trợ lý Thị trường' : 'Trợ lý Kỹ thuật'
  const subtitle = isManager 
    ? 'Phân tích từ USDA + WTO + Chợ đầu mối' 
    : 'Kiến thức canh tác + VietGAP + Bệnh cây'

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    if (!inputValue.trim()) return

    const newUserMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
    }

    // Mock bot response
    const newBotMsg: ChatMessage = {
      id: `bot-${Date.now() + 1}`,
      role: 'assistant',
      content: 'Đây là câu trả lời mô phỏng từ AI. (Tính năng kết nối model thật chưa được kích hoạt trong bản prototype này).',
      sources: ['Nguồn mô phỏng 1', 'Nguồn mô phỏng 2'],
    }

    setMessages([...messages, newUserMsg, newBotMsg])
    setInputValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const startNewConversation = () => {
    setMessages([])
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
          <li className={`${styles.historyItem} ${styles.active}`}>
            <MessageSquare size={16} className={styles.iconInline} />
            Giá lúa gạo hôm nay thế nào?
          </li>
          <li className={styles.historyItem}>
            <MessageSquare size={16} className={styles.iconInline} />
            Dự báo thời tiết tuần tới
          </li>
          {isManager ? (
            <li className={styles.historyItem}>
              <MessageSquare size={16} className={styles.iconInline} />
              Báo cáo xuất khẩu quý 3
            </li>
          ) : (
            <li className={styles.historyItem}>
              <MessageSquare size={16} className={styles.iconInline} />
              Xử lý rầy nâu hại lúa
            </li>
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
                {msg.content}
                
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
            />
            <button 
              className={styles.sendBtn} 
              onClick={handleSend}
              disabled={!inputValue.trim()}
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
