// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import { useEffect, useState } from 'react'
import { Button, Card, Pill } from '@/components/ui'
import type { AppStoreStatus, StoreAction, StoreApp } from '@/domain/entities/app-store'
import { fetchJson } from '@/lib/api/fetch-json'
import styles from './AppStoreClient.module.css'

export interface AppStoreData {
  workerAlive: boolean
  apps: StoreApp[]
}

const POLL_MS = 3000
const ROLE_LABELS: Record<string, string> = { manager: 'Trưởng HTX', officer: 'Cán bộ', farmer: 'Nông dân' }
const STATUS_LABELS: Record<AppStoreStatus, string> = {
  available: 'Chưa cài',
  installing: 'Đang cài…',
  enabled: 'Đã cài',
  removing: 'Đang gỡ…',
  enabled_all: 'Đã cài cho mọi HTX (quản trị máy chủ)',
  failed: 'Lỗi',
}
const STATUS_TONES: Record<AppStoreStatus, 'green' | 'amber' | 'blue' | 'neutral'> = {
  available: 'neutral',
  installing: 'blue',
  enabled: 'green',
  removing: 'blue',
  enabled_all: 'green',
  failed: 'amber',
}
const WORKER_WARNING = 'Trình cài đặt chưa chạy. Yêu cầu sẽ được xử lý khi quản trị máy chủ bật ./dxos worker.'
const CONFIRM_REMOVE = 'Gỡ ứng dụng này khỏi HTX? Dữ liệu được giữ lại.'
const REQUEST_FAILED = 'Không gửi được yêu cầu. Vui lòng thử lại.'

export function AppStoreClient({ initial }: { initial: AppStoreData }) {
  const [data, setData] = useState(initial)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const working = data.apps.some(app => app.status === 'installing' || app.status === 'removing')

  // Poll only while the worker has something to do.
  useEffect(() => {
    if (!working) return
    const timer = setInterval(() => {
      fetchJson<{ data: AppStoreData }>('/api/app-store')
        .then(body => setData(body.data))
        .catch(() => undefined) // keep the last state; the next tick tries again
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [working])

  async function request(app: StoreApp, action: StoreAction) {
    if (action === 'DISABLE' && !window.confirm(CONFIRM_REMOVE)) return
    setPendingId(app.id)
    setMessage(null)
    try {
      const response = await fetch('/api/app-store/requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ appId: app.id, action }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        setMessage(body?.error?.message ?? REQUEST_FAILED)
        return
      }
      const status: AppStoreStatus = action === 'ENABLE' ? 'installing' : 'removing'
      setData(current => ({ ...current, apps: current.apps.map(item => (item.id === app.id ? { ...item, status, error: null } : item)) }))
    } catch {
      setMessage(REQUEST_FAILED)
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Kho ứng dụng</h1>
        <p className={styles.subtitle}>Cài thêm ứng dụng cho HTX của bạn hoặc gỡ ứng dụng không dùng nữa.</p>
      </header>

      {!data.workerAlive && (
        <p className={styles.notice} role="status">
          {WORKER_WARNING}
        </p>
      )}
      {message && (
        <p className={styles.error} role="alert">
          {message}
        </p>
      )}

      {data.apps.length === 0 ? (
        <p className={styles.empty}>Kho chưa có ứng dụng nào.</p>
      ) : (
        <ul className={styles.grid}>
          {data.apps.map(app => (
            <li key={app.id} className={styles.item}>
              <Card className={styles.card}>
                <div className={styles.cardHead}>
                  <h2 className={styles.name}>{app.name}</h2>
                  <span className={styles.version}>v{app.version}</span>
                </div>
                {app.description && <p className={styles.description}>{app.description}</p>}
                <p className={styles.meta}>
                  {app.publisher} · {app.license}
                  {app.roles.length > 0 && <> · Dành cho {app.roles.map(role => ROLE_LABELS[role] ?? role).join(', ')}</>}
                  {app.hasPublic && <> · Có trang công khai</>}
                </p>
                <div className={styles.footer}>
                  <Pill tone={STATUS_TONES[app.status]} size="md">
                    {STATUS_LABELS[app.status]}
                  </Pill>
                  {app.status === 'available' && (
                    <Button size="sm" isLoading={pendingId === app.id} onClick={() => request(app, 'ENABLE')}>
                      Cài
                    </Button>
                  )}
                  {app.status === 'enabled' && (
                    <Button size="sm" variant="secondary" isLoading={pendingId === app.id} onClick={() => request(app, 'DISABLE')}>
                      Gỡ
                    </Button>
                  )}
                  {app.status === 'failed' && (
                    <Button size="sm" isLoading={pendingId === app.id} onClick={() => request(app, 'ENABLE')}>
                      Thử lại
                    </Button>
                  )}
                </div>
                {app.status === 'failed' && app.error && (
                  <p className={styles.error} role="alert">
                    {app.error}
                  </p>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
