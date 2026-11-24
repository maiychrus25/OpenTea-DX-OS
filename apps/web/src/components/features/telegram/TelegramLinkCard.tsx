// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import styles from './TelegramLinkCard.module.css'

interface TelegramStatus {
  configured: boolean
  linked: boolean
  group_linked: boolean
}

interface TelegramLinkCardProps {
  role: 'manager' | 'officer' | 'farmer'
}

async function call<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error?.message ?? LOAD_FAILED_MESSAGE)
  return body.data as T
}

/** "Kết nối Telegram" on the profile page: the personal link, and for managers the cooperative's group. */
export function TelegramLinkCard({ role }: TelegramLinkCardProps) {
  const [status, setStatus] = useState<TelegramStatus | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [linkUrl, setLinkUrl] = useState<string | null>(null)
  const [groupCommand, setGroupCommand] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoadFailed(false)
    fetchJson<{ data: TelegramStatus }>('/api/telegram/status')
      .then((res) => setStatus(res.data))
      .catch(() => setLoadFailed(true))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : LOAD_FAILED_MESSAGE)
    } finally {
      setBusy(false)
    }
  }

  const connect = () =>
    run(async () => {
      const data = await call<{ url: string }>('/api/telegram/link', { method: 'POST' })
      setLinkUrl(data.url)
    })

  const disconnect = () =>
    run(async () => {
      await call('/api/telegram/link', { method: 'DELETE' })
      setLinkUrl(null)
      load()
    })

  const createGroupCode = () =>
    run(async () => {
      const data = await call<{ command: string }>('/api/telegram/group-link', { method: 'POST' })
      setGroupCommand(data.command)
    })

  if (loadFailed) {
    return (
      <section aria-label="Kết nối Telegram" className={styles.card}>
        <h2 className={styles.title}>Kết nối Telegram</h2>
        <p className={styles.description}>{LOAD_FAILED_MESSAGE}</p>
      </section>
    )
  }
  if (!status) return null
  if (!status.configured) {
    return (
      <section aria-label="Kết nối Telegram" className={styles.card}>
        <h2 className={styles.title}>Kết nối Telegram</h2>
        <p className={styles.description}>Telegram chưa được cấu hình cho hệ thống này.</p>
      </section>
    )
  }

  return (
    <section aria-label="Kết nối Telegram" className={styles.card}>
      <h2 className={styles.title}>Kết nối Telegram</h2>
      <p className={styles.description}>
        {status.linked
          ? 'Đã kết nối. Bạn sẽ nhận đề xuất và báo cáo của HTX qua Telegram.'
          : 'Nhận đề xuất và báo cáo của HTX qua Telegram. Tin nhắn được gửi qua máy chủ của Telegram.'}
      </p>
      <div className={styles.actions}>
        {status.linked ? (
          <Button variant="secondary" onClick={disconnect} disabled={busy}>
            Gỡ liên kết
          </Button>
        ) : (
          <Button onClick={connect} disabled={busy}>
            Kết nối Telegram
          </Button>
        )}
      </div>
      {linkUrl && (
        <p className={styles.hint}>
          Mở liên kết, rồi bấm Start trong Telegram. Mã chỉ dùng được một lần và hết hạn sau 10 phút:{' '}
          <a href={linkUrl} target="_blank" rel="noopener noreferrer" className={styles.link}>
            Mở Telegram
          </a>
        </p>
      )}

      {role === 'manager' && (
        <div className={styles.group}>
          <h3 className={styles.subtitle}>Kết nối nhóm Telegram của HTX</h3>
          <p className={styles.description}>
            {status.group_linked
              ? 'Nhóm đã được kết nối và sẽ nhận báo cáo tự động.'
              : 'Thêm bot vào nhóm, rồi gửi lệnh bên dưới trong nhóm để nhận báo cáo.'}
          </p>
          <div className={styles.actions}>
            <Button variant="secondary" onClick={createGroupCode} disabled={busy}>
              Tạo lệnh cho nhóm
            </Button>
          </div>
          {groupCommand && (
            <p className={styles.hint}>
              Gửi lệnh này trong nhóm (dùng một lần, hết hạn sau 10 phút): <code className={styles.code}>{groupCommand}</code>
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </section>
  )
}
