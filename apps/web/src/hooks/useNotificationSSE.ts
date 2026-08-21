// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { useEffect, useRef, useState, useCallback } from 'react'

interface SSENotification {
  id: string
  title: string
  detail: string
  tone: string
  created_at: string
  read: boolean
  link_url?: string
}

interface UseNotificationSSEReturn {
  latestNotification: SSENotification | null
  unreadCount: number
  isConnected: boolean
  error: string | null
}

const MAX_RECONNECT_DELAY_MS = 30000
const INITIAL_RECONNECT_DELAY_MS = 1000

/**
 * Custom hook for SSE notification stream with auto-reconnect.
 * Falls back gracefully — if SSE fails, the SWR polling in NotificationBell remains active.
 * DEV-003: Do not claim polling is SSE until parity is proven.
 */
export function useNotificationSSE(enabled: boolean = true): UseNotificationSSEReturn {
  const [latestNotification, setLatestNotification] = useState<SSENotification | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY_MS)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setIsConnected(false)
  }, [])

  const connect = useCallback(() => {
    if (!enabled) return

    cleanup()

    try {
      const es = new EventSource('/api/notifications/stream')
      eventSourceRef.current = es

      es.addEventListener('connected', () => {
        setIsConnected(true)
        setError(null)
        reconnectDelayRef.current = INITIAL_RECONNECT_DELAY_MS
      })

      es.addEventListener('notification', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data) as SSENotification
          setLatestNotification(data)
          if (!data.read) {
            setUnreadCount(prev => prev + 1)
          }
        } catch {
          // Malformed SSE data — skip
        }
      })

      es.addEventListener('unread_count', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data)
          if (typeof data.unread_count === 'number') {
            setUnreadCount(data.unread_count)
          }
        } catch {
          // Malformed SSE data — skip
        }
      })

      es.onerror = () => {
        setIsConnected(false)
        es.close()
        eventSourceRef.current = null

        // Exponential backoff reconnect
        const delay = reconnectDelayRef.current
        reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY_MS)

        setError(`Mất kết nối SSE. Thử lại sau ${Math.round(delay / 1000)}s...`)

        reconnectTimerRef.current = setTimeout(() => {
          connect()
        }, delay)
      }
    } catch {
      setError('Không thể khởi tạo kết nối SSE')
    }
  }, [enabled, cleanup])

  useEffect(() => {
    connect()
    return cleanup
  }, [connect, cleanup])

  return { latestNotification, unreadCount, isConnected, error }
}
