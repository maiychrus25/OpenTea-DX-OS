// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { redirectToLogin } from '@/lib/api/redirect-to-login'
import { readChatStream, stripThinking } from './chat-stream'

export type ChatType = 'market' | 'technical'
export interface ChatSession { session_id: string; title: string; updated_at?: string }
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
  isError?: boolean
}
const unavailable = 'Dịch vụ AI hiện không khả dụng. Vui lòng thử lại sau.'
const connectionError = 'Không thể kết nối tới AI. Vui lòng kiểm tra kết nối và thử lại.'
const newId = () => `chat-${crypto.randomUUID()}`

export function useChat(chatType: ChatType) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [sessionId, setSessionId] = useState(newId)
  const [streamingId, setStreamingId] = useState<string | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [sessionsError, setSessionsError] = useState('')
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const active = useRef<AbortController | null>(null)
  const sessionRequest = useRef<AbortController | null>(null)

  const fetchSessions = useCallback(async () => {
    sessionRequest.current?.abort()
    const controller = new AbortController()
    sessionRequest.current = controller
    setSessionsLoading(true)
    try {
      const response = await fetch(`/api/chatbot/sessions?type=${chatType}`, { signal: controller.signal })
      if (controller.signal.aborted) return
      if (response.status === 401) { redirectToLogin(); return }
      if (!response.ok) throw new Error('sessions')
      const data = await response.json()
      if (!controller.signal.aborted) {
        setSessions(data.data?.sessions || [])
        setSessionsError('')
      }
    } catch {
      if (!controller.signal.aborted) setSessionsError('Không tải được lịch sử trò chuyện.')
    } finally {
      if (!controller.signal.aborted) setSessionsLoading(false)
    }
  }, [chatType])

  useEffect(() => {
    void fetchSessions()
    return () => { active.current?.abort(); sessionRequest.current?.abort() }
  }, [fetchSessions])

  const cancelActive = () => {
    active.current?.abort()
    active.current = null
    setStreamingId(null)
    setHistoryLoading(false)
  }

  const stop = () => {
    cancelActive()
    setMessages(previous => previous.map(message => message.id === streamingId && !message.content
      ? { ...message, content: 'Đã dừng trả lời.' } : message))
    void fetchSessions()
  }

  const startNew = () => {
    cancelActive()
    setSessionId(newId())
    setMessages([])
    setHistoryError('')
  }

  const loadSession = async (id: string) => {
    cancelActive()
    const controller = new AbortController()
    active.current = controller
    setSessionId(id)
    setMessages([])
    setHistoryError('')
    setHistoryLoading(true)
    try {
      const response = await fetch(`/api/chatbot?session_id=${encodeURIComponent(id)}&type=${chatType}`, { signal: controller.signal })
      if (controller.signal.aborted) return
      if (response.status === 401) { redirectToLogin(); return }
      if (!response.ok) throw new Error('history')
      const data = await response.json()
      if (!controller.signal.aborted) {
        const history: Omit<ChatMessage, 'id'>[] = data.data?.history || []
        setMessages(history.map((message, index) => ({
          ...message, id: `history-${index}`,
          content: message.role === 'assistant' ? stripThinking(message.content) : message.content,
        })))
      }
    } catch {
      if (!controller.signal.aborted) setHistoryError('Không tải được cuộc trò chuyện. Vui lòng chọn lại để thử lại.')
    } finally {
      if (active.current === controller && !controller.signal.aborted) {
        active.current = null
        setHistoryLoading(false)
      }
    }
  }

  const send = async (input: string) => {
    const text = input.trim()
    if (!text || active.current || historyError) return
    const controller = new AbortController()
    active.current = controller
    const botId = newId()
    const update = (patch: Partial<ChatMessage>) => {
      if (active.current === controller && !controller.signal.aborted) {
        setMessages(previous => previous.map(message => message.id === botId ? { ...message, ...patch } : message))
      }
    }
    setMessages(previous => [...previous,
      { id: newId(), role: 'user', content: text },
      { id: botId, role: 'assistant', content: '' },
    ])
    setStreamingId(botId)
    try {
      const response = await fetch('/api/chatbot', {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text, type: chatType, session_id: sessionId,
          history: messages.filter(message => !message.isError && message.content).slice(-10)
            .map(({ role, content }) => ({ role, content })),
        }),
      })
      if (controller.signal.aborted) return
      if (response.status === 401) { redirectToLogin(); return }
      if (!response.ok) {
        update({ content: response.status === 503 ? unavailable : connectionError, isError: true })
        return
      }
      if (!response.body) throw new Error(connectionError)
      await readChatStream(response.body, controller.signal, update,
        content => update({ content: stripThinking(content), isError: true, sources: [] }))
    } catch {
      update({ content: connectionError, isError: true, sources: [] })
    } finally {
      if (active.current === controller && !controller.signal.aborted) {
        active.current = null
        setStreamingId(null)
        setMessages(previous => previous.map(message => message.id === botId && !message.content
          ? { ...message, content: 'AI chưa trả về nội dung. Vui lòng thử lại.', isError: true } : message))
        void fetchSessions()
      }
    }
  }

  return { messages, sessions, sessionId, streamingId, historyLoading, historyError,
    sessionsError, sessionsLoading, fetchSessions, send, stop, startNew, loadSession }
}
