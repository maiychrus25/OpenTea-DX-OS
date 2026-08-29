// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import * as React from 'react'
import { useEffect, useRef, useState, useCallback } from 'react'
import { Bell, Volume2, Square, Loader2 } from 'lucide-react'
import useSWR from 'swr'
import { useNotificationSSE } from '@/hooks/useNotificationSSE'
import styles from './NotificationBell.module.css'

export interface NotificationBellProps {
  role: string
}

export interface Notification {
  id: string
  title: string
  detail: string
  tone: 'green' | 'amber' | 'blue' | 'neutral'
  created_at: string
  read: boolean
  link_url?: string | null
}

// ── API response shape (matches GetNotificationsUseCase output) ──────────────
interface NotificationsApiResponse {
  data: {
    notifications: Notification[]
    unreadCount: number
  }
}

// ── TTS playback state ───────────────────────────────────────────────────────
type TtsState = 'idle' | 'loading' | 'playing' | 'unavailable' | 'error'

const fetcher = (url: string): Promise<NotificationsApiResponse> =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error('Failed to fetch notifications')
    return res.json()
  })

export const NotificationBell: React.FC<NotificationBellProps> = ({ role }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // ── TTS state: maps notificationId → TtsState ─────────────────────────────
  const [ttsStates, setTtsStates] = useState<Record<string, TtsState>>({})
  const activeAudioRef = useRef<HTMLAudioElement | null>(null)
  const activeAudioIdRef = useRef<string | null>(null)

  // ── SWR polling (60s interval as per AC8) ─────────────────────────────────
  const { data, mutate } = useSWR<NotificationsApiResponse>(
    '/api/notifications?limit=5',
    fetcher,
    {
      // DEV-003: Interim fallback using polling. Target contract is SSE.
      // SSE integration below triggers revalidation. Do not remove polling until SSE parity is fully established.
      refreshInterval: 60000,
    }
  )

  // ── SSE integration: revalidate SWR when SSE pushes new notification ───────
  const { latestNotification, unreadCount: sseUnreadCount } = useNotificationSSE(true)

  useEffect(() => {
    if (latestNotification) {
      // New notification arrived via SSE — revalidate SWR to sync
      mutate()
    }
  }, [latestNotification, mutate])

  // ── Click-outside handler ─────────────────────────────────────────────────
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Derived data ──────────────────────────────────────────────────────────
  const notifications = data?.data?.notifications ?? []
  // FIX: Use canonical `unreadCount` key from GetNotificationsUseCase response.
  // Reconcile: prefer SWR value (from REST); use SSE count as secondary signal.
  const swrUnreadCount = data?.data?.unreadCount ?? 0
  const unreadCount = swrUnreadCount > 0 ? swrUnreadCount : sseUnreadCount

  // ── Mark as read ──────────────────────────────────────────────────────────
  const handleMarkAsRead = useCallback(async (id?: string) => {
    // Optimistic update
    if (data?.data) {
      await mutate(
        {
          data: {
            notifications: data.data.notifications.map((n) =>
              id ? (n.id === id ? { ...n, read: true } : n) : { ...n, read: true }
            ),
            unreadCount: id ? Math.max(0, swrUnreadCount - 1) : 0,
          },
        },
        false
      )
    }

    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(id ? { id, action: 'mark-read' } : { action: 'mark-all-read' }),
      })
    } finally {
      // M3 fix: catch revalidation failures so UI doesn't silently stay in wrong state
      // TODO(issue-171): Show toast "Không thể đồng bộ thông báo, vui lòng tải lại trang" on failure
      mutate().catch(() => { /* revalidation failed — UI will recover on next SWR poll */ })
    }
  }, [data, mutate, swrUnreadCount])

  const handleNotificationClick = useCallback((n: Notification) => {
    if (!n.read) {
      handleMarkAsRead(n.id)
    }
  }, [handleMarkAsRead])

  // ── TTS: play/stop with proper state management (9-2 AC5) ────────────────
  const handleTts = useCallback(async (e: React.MouseEvent, notifId: string, text: string) => {
    e.preventDefault()
    e.stopPropagation()

    // Stop if already playing this notification
    if (ttsStates[notifId] === 'playing') {
      activeAudioRef.current?.pause()
      activeAudioRef.current = null
      activeAudioIdRef.current = null
      setTtsStates((prev) => ({ ...prev, [notifId]: 'idle' }))
      return
    }

    // Stop any other playing audio first
    if (activeAudioRef.current && activeAudioIdRef.current) {
      activeAudioRef.current.pause()
      setTtsStates((prev) => ({ ...prev, [activeAudioIdRef.current!]: 'idle' }))
      activeAudioRef.current = null
      activeAudioIdRef.current = null
    }

    setTtsStates((prev) => ({ ...prev, [notifId]: 'loading' }))

    try {
      // Check Piper availability first (avoids hanging fetch on unavailable service)
      const statusRes = await fetch('/api/tts/status')
      if (statusRes.ok) {
        const statusData = await statusRes.json()
        if (!statusData.available) {
          setTtsStates((prev) => ({ ...prev, [notifId]: 'unavailable' }))
          setTimeout(() => setTtsStates((prev) => ({ ...prev, [notifId]: 'idle' })), 3000)
          return
        }
      }

      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })

      if (!res.ok) {
        setTtsStates((prev) => ({ ...prev, [notifId]: 'error' }))
        setTimeout(() => setTtsStates((prev) => ({ ...prev, [notifId]: 'idle' })), 3000)
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      activeAudioRef.current = audio
      activeAudioIdRef.current = notifId

      audio.onplay = () => setTtsStates((prev) => ({ ...prev, [notifId]: 'playing' }))
      audio.onended = () => {
        URL.revokeObjectURL(url)
        activeAudioRef.current = null
        activeAudioIdRef.current = null
        setTtsStates((prev) => ({ ...prev, [notifId]: 'idle' }))
      }
      audio.onerror = () => {
        URL.revokeObjectURL(url)
        activeAudioRef.current = null
        activeAudioIdRef.current = null
        setTtsStates((prev) => ({ ...prev, [notifId]: 'error' }))
        setTimeout(() => setTtsStates((prev) => ({ ...prev, [notifId]: 'idle' })), 3000)
      }

      audio.play().catch(() => {
        // Audio autoplay blocked by browser — reset state silently
        setTtsStates((prev) => ({ ...prev, [notifId]: 'idle' }))
      })
    } catch {
      // Network error — show error state, auto-reset after 3s
      setTtsStates((prev) => ({ ...prev, [notifId]: 'error' }))
      setTimeout(() => setTtsStates((prev) => ({ ...prev, [notifId]: 'idle' })), 3000)
    }
  }, [ttsStates])

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      activeAudioRef.current?.pause()
    }
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div ref={ref} className={styles.wrap}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Thông báo"
        aria-expanded={open}
        className={styles.bellBtn}
        data-testid="bell-button"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className={styles.badge} data-testid="notif-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className={styles.panel} data-testid="notif-panel" role="dialog" aria-label="Danh sách thông báo">
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Thông báo mới</span>
            {unreadCount > 0 && (
              <button
                className={styles.markReadBtn}
                onClick={() => handleMarkAsRead()}
                data-testid="mark-all-read-btn"
              >
                Đánh dấu đã đọc
              </button>
            )}
          </div>

          <div className={styles.list}>
            {notifications.length === 0 ? (
              <div className={styles.empty}>Không có thông báo nào</div>
            ) : (
              notifications.map((n) => {
                const toneClass =
                  n.tone === 'green' ? styles.toneGreen :
                  n.tone === 'amber' ? styles.toneAmber :
                  n.tone === 'blue'  ? styles.toneBlue  :
                  styles.toneNeutral

                const ttsState = ttsStates[n.id] ?? 'idle'

                return (
                  <a
                    key={n.id}
                    href={n.link_url || '#'}
                    className={`${styles.notifItem} ${!n.read ? styles.unread : ''}`}
                    data-testid={`notif-item-${n.id}`}
                    onClick={(e) => {
                      if (!n.link_url) e.preventDefault()
                      handleNotificationClick(n)
                    }}
                  >
                    <div className={styles.notifDotWrap}>
                      {!n.read && <div className={`${styles.notifDot} ${toneClass}`} />}
                    </div>

                    <div className={styles.content}>
                      <div className={styles.title}>{n.title}</div>
                      <div className={styles.detail}>{n.detail}</div>
                      <div className={styles.time}>
                        {new Date(n.created_at).toLocaleString('vi-VN')}
                      </div>
                    </div>

                    {/* TTS button with proper state indicators (9-2 AC5) */}
                    <button
                      className={`${styles.ttsBtn} ${styles[`ttsBtn--${ttsState}`] ?? ''}`}
                      onClick={(e) => handleTts(e, n.id, `${n.title}. ${n.detail}`)}
                      aria-label={
                        ttsState === 'playing'     ? 'Dừng đọc thông báo' :
                        ttsState === 'loading'     ? 'Đang tải giọng đọc' :
                        ttsState === 'unavailable' ? 'Dịch vụ đọc không khả dụng' :
                        ttsState === 'error'       ? 'Lỗi đọc thông báo' :
                        'Đọc thông báo'
                      }
                      disabled={ttsState === 'loading' || ttsState === 'unavailable'}
                      data-testid={`tts-btn-${n.id}`}
                      data-tts-state={ttsState}
                    >
                      {ttsState === 'loading'  ? <Loader2 size={16} className={styles.ttsSpinner} /> :
                       ttsState === 'playing'  ? <Square   size={16} /> :
                       <Volume2 size={16} />}
                    </button>
                  </a>
                )
              })
            )}
          </div>

          <div className={styles.footer}>
            <a href={`/${role}/notifications`} className={styles.seeAll}>
              Xem tất cả
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
