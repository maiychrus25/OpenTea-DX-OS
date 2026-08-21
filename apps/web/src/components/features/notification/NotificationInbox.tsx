// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState } from 'react'
import { Bell, Volume2, Check, CheckCheck, ExternalLink, Loader2 } from 'lucide-react'
import useSWR from 'swr'
import styles from './notification-inbox.module.css'

interface Notification {
  id: string
  title: string
  detail: string
  tone: 'green' | 'amber' | 'blue' | 'neutral'
  created_at: string
  read: boolean
  link_url?: string | null
}

type FilterType = 'all' | 'unread'

interface NotificationInboxProps {
  role: string
}

const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) throw new Error('Failed to fetch')
  return res.json()
})

export function NotificationInbox({ role }: NotificationInboxProps) {
  const [filter, setFilter] = useState<FilterType>('all')
  const [limit, setLimit] = useState(20)
  const [playingId, setPlayingId] = useState<string | null>(null)

  const queryFilter = filter === 'unread' ? '&filter=unread' : ''
  const { data, mutate, isLoading } = useSWR<{ data: { notifications: Notification[], unreadCount: number } }>(
    `/api/notifications?limit=${limit}${queryFilter}`,
    fetcher,
    { refreshInterval: 30000 }
  )

  const notifications = data?.data?.notifications || []
  const unreadCount = data?.data?.unreadCount || 0

  const handleMarkRead = async (id: string) => {
    // Optimistic update
    if (data) {
      mutate({
        data: {
          notifications: data.data.notifications.map(n =>
            n.id === id ? { ...n, read: true } : n
          ),
          unreadCount: Math.max(0, (data.data.unreadCount || 0) - 1),
        },
      }, false)
    }

    await fetch('/api/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'mark-read' }),
    })
    mutate()
  }

  const handleMarkAllRead = async () => {
    if (data) {
      mutate({
        data: {
          notifications: data.data.notifications.map(n => ({ ...n, read: true })),
          unreadCount: 0,
        },
      }, false)
    }

    await fetch('/api/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark-all-read' }),
    })
    mutate()
  }

  const handleTTS = async (notification: Notification) => {
    if (playingId === notification.id) {
      setPlayingId(null)
      return
    }

    setPlayingId(notification.id)
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `${notification.title}. ${notification.detail}` }),
      })

      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audio.onended = () => {
          URL.revokeObjectURL(url)
          setPlayingId(null)
        }
        audio.play().catch(() => {
          setPlayingId(null)
        })
      } else {
        alert('Dịch vụ TTS hiện không khả dụng.')
        setPlayingId(null)
      }
    } catch {
      alert('Lỗi kết nối dịch vụ TTS.')
      setPlayingId(null)
    }
  }

  const toneClass = (tone: string) => {
    switch (tone) {
      case 'green': return styles.toneGreen
      case 'amber': return styles.toneAmber
      case 'blue': return styles.toneBlue
      default: return styles.toneNeutral
    }
  }

  const roleLabel = role === 'manager' ? 'Trưởng HTX' : role === 'officer' ? 'Cán bộ KT' : 'Nông dân'

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Bell size={24} className={styles.bellIcon} />
          <div>
            <h1 className={styles.title}>Thông báo</h1>
            <p className={styles.subtitle}>Quản lý thông báo của {roleLabel}</p>
          </div>
        </div>
        {unreadCount > 0 && (
          <button className={styles.markAllBtn} onClick={handleMarkAllRead}>
            <CheckCheck size={16} />
            Đánh dấu tất cả đã đọc ({unreadCount})
          </button>
        )}
      </header>

      <div className={styles.filterRow}>
        <button
          className={`${styles.filterTab} ${filter === 'all' ? styles.filterActive : ''}`}
          onClick={() => setFilter('all')}
        >
          Tất cả
        </button>
        <button
          className={`${styles.filterTab} ${filter === 'unread' ? styles.filterActive : ''}`}
          onClick={() => setFilter('unread')}
        >
          Chưa đọc {unreadCount > 0 && <span className={styles.badge}>{unreadCount}</span>}
        </button>
      </div>

      <div className={styles.list}>
        {isLoading ? (
          <div className={styles.emptyState}>
            <Loader2 size={24} className={styles.spin} />
            <p>Đang tải thông báo...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className={styles.emptyState}>
            <Bell size={40} className={styles.emptyIcon} />
            <p>{filter === 'unread' ? 'Không có thông báo chưa đọc' : 'Chưa có thông báo nào'}</p>
          </div>
        ) : (
          notifications.map(n => (
            <div
              key={n.id}
              className={`${styles.notifItem} ${!n.read ? styles.unread : ''}`}
            >
              <div className={`${styles.toneDot} ${toneClass(n.tone)}`} />
              <div className={styles.notifContent}>
                <div className={styles.notifTitle}>{n.title}</div>
                <div className={styles.notifDetail}>{n.detail}</div>
                <div className={styles.notifMeta}>
                  <time className={styles.notifTime}>
                    {new Date(n.created_at).toLocaleString('vi-VN')}
                  </time>
                  <div className={styles.notifActions}>
                    {!n.read && (
                      <button
                        className={styles.actionBtn}
                        onClick={() => handleMarkRead(n.id)}
                        title="Đánh dấu đã đọc"
                      >
                        <Check size={14} />
                      </button>
                    )}
                    <button
                      className={`${styles.actionBtn} ${playingId === n.id ? styles.playing : ''}`}
                      onClick={() => handleTTS(n)}
                      title="Đọc thông báo"
                    >
                      <Volume2 size={14} />
                    </button>
                    {n.link_url && (
                      <a
                        href={n.link_url}
                        className={styles.actionBtn}
                        title="Xem chi tiết"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {notifications.length >= limit && (
        <div className={styles.loadMore}>
          <button
            className={styles.loadMoreBtn}
            onClick={() => setLimit(prev => prev + 20)}
          >
            Tải thêm thông báo
          </button>
        </div>
      )}
    </div>
  )
}
