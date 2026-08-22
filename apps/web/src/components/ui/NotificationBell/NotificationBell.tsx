// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { Bell, Volume2 } from 'lucide-react'
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
  link_url?: string
}

const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) throw new Error('Failed to fetch')
  return res.json()
})

export const NotificationBell: React.FC<NotificationBellProps> = ({ role }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { data, mutate } = useSWR<{ data: { notifications: Notification[], unreadCount: number } }>('/api/notifications?limit=5', fetcher, {
    // DEV-003: Interim fallback using polling. Target contract is SSE.
    // SSE integration below triggers revalidation. Do not remove polling until SSE parity is fully established.
    refreshInterval: 60000,
  })

  // SSE integration: when new notification arrives via SSE, revalidate SWR data
  const { latestNotification } = useNotificationSSE(true)
  useEffect(() => {
    if (latestNotification) {
      mutate()
    }
  }, [latestNotification, mutate])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const notifications = data?.data?.notifications || []
  const unreadCount = data?.data?.unreadCount || 0

  const handleMarkAsRead = async (id?: string) => {
    try {
      // Optimistic update
      if (data) {
        mutate(
          {
            data: {
              notifications: data.data.notifications.map((n) =>
                id ? (n.id === id ? { ...n, read: true } : n) : { ...n, read: true }
              ),
              unreadCount: id ? Math.max(0, (data.data.unreadCount || 0) - 1) : 0,
            },
          },
          false
        )
      }

      await fetch('/api/notifications', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(id ? { id, action: 'mark-read' } : { action: 'mark-all-read' }),
      })
      
      mutate() // Revalidate
    } catch (_error) {
      // Ghi chú: Có thể thêm UI Toast để báo lỗi tại đây
    }
  }

  const handleNotificationClick = (n: Notification) => {
    if (!n.read) {
      handleMarkAsRead(n.id)
    }
    // If it has a link_url, we should navigate. This is handled by wrapping it in an `a` tag or router push.
  }

  return (
    <div ref={ref} className={styles.wrap}>
      <button 
        onClick={() => setOpen((o) => !o)} 
        aria-label="Thông báo" 
        className={styles.bellBtn}
        data-testid="bell-button"
      >
        <Bell size={20} />
        {unreadCount > 0 && <span className={styles.badge} data-testid="notif-badge">{unreadCount}</span>}
      </button>
      
      {open && (
        <div className={styles.panel} data-testid="notif-panel">
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Thông báo mới</span>
            {unreadCount > 0 && (
              <button 
                className={styles.markReadBtn} 
                onClick={() => handleMarkAsRead()}
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
                  n.tone === 'blue' ? styles.toneBlue :
                  styles.toneNeutral

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
                      <div className={styles.time}>{new Date(n.created_at).toLocaleString('vi-VN')}</div>
                    </div>
                    <button 
                      className={styles.ttsBtn}
                      onClick={async (e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        try {
                          const res = await fetch('/api/tts', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ text: `${n.title}. ${n.detail}` })
                          });
                          if (res.ok) {
                            const blob = await res.blob();
                            const url = URL.createObjectURL(blob);
                            const audio = new Audio(url);
                            audio.onended = () => URL.revokeObjectURL(url);
                            audio.play().catch(() => {
                              // Audio autoplay may be blocked by browser
                            });
                          } else {
                            alert('Dịch vụ đọc văn bản (TTS) hiện không khả dụng. Vui lòng thử lại sau.');
                          }
                        } catch {
                          alert('Lỗi kết nối dịch vụ TTS. Vui lòng kiểm tra lại mạng.');
                        }
                      }}
                      aria-label="Đọc thông báo"
                    >
                      <Volume2 size={16} />
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
