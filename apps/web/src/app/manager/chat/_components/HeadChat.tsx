// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React from 'react'
import Link from 'next/link'
import { BarChart3, BookOpen, Calendar, ChevronRight, Clock, FlaskConical, MessageCircle, Sparkles } from 'lucide-react'
import { ChatInterface } from '@/components/ui/chat-interface/chat-interface'
import { PageHeader } from '@/components/ui/PageHeader'
import kit from '@/components/features/dashboard/page-kit.module.css'
import styles from './chat.module.css'

const SHORTCUTS = [
  { label: 'Xem lịch thu hái', href: '/manager/schedule', icon: <Calendar size={18} /> },
  { label: 'Duyệt nhật ký canh tác', href: '/manager/journal-approve', icon: <BookOpen size={18} /> },
  { label: 'Tra cứu thuốc bảo vệ thực vật', href: '/manager/pesticides', icon: <FlaskConical size={18} /> },
  { label: 'Xem giá thu mua hiện tại', href: '/manager/leaf-prices', icon: <BarChart3 size={18} /> },
]

/** The head's chat: the conversation, shortcuts and the past conversations. */
export function HeadChat() {
  return (
    <div className={`${kit.page} ${styles.page}`}>
      <PageHeader icon={<MessageCircle size={28} />} title="Chatbot" description="Trợ lý ảo hỗ trợ tra cứu, hướng dẫn và giải đáp thắc mắc về sản xuất, thu hái và quản lý HTX." />
      <ChatInterface
        role="manager"
        aside={({ sessions, open }) => (
          <aside className={styles.side}>
            <section className={styles.box}>
              <h2><Sparkles size={18} aria-hidden="true" />Gợi ý nhanh</h2>
              <ul>
                {SHORTCUTS.map((s) => (
                  <li key={s.href}><Link href={s.href}><span aria-hidden="true">{s.icon}</span>{s.label}<ChevronRight size={15} aria-hidden="true" /></Link></li>
                ))}
              </ul>
            </section>
            <section className={styles.box}>
              <h2><Clock size={18} aria-hidden="true" />Lịch sử hội thoại</h2>
              {sessions.length === 0 ? <p>Chưa có cuộc trò chuyện nào.</p> : (
                <ul>
                  {sessions.slice(0, 4).map((s) => (
                    <li key={s.session_id}><button type="button" onClick={() => open(s.session_id)}><MessageCircle size={15} aria-hidden="true" />{s.title}</button></li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        )}
      />
    </div>
  )
}
