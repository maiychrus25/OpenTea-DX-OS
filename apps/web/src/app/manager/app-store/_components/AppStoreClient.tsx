// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Button, Card, Pill } from '@/components/ui'
import type { AppStoreStatus, StoreAction, StoreApp, StoreCategory } from '@/domain/entities/app-store'
import { fetchJson } from '@/lib/api/fetch-json'
import styles from './AppStoreClient.module.css'
import { StoreAppIcon } from './StoreAppIcon'
import { StoreHistory } from './StoreHistory'
import { CATEGORY_LABELS, hasNewVersion, INSTALLED_STATUSES, NEW_VERSION_LABEL, normalizeSearch, ROLE_LABELS, STATUS_LABELS, STATUS_TONES, WORKER_WARNING } from './store-labels'
import { useStorePolling } from './use-store-polling'

export interface AppStoreData {
  workerAlive: boolean
  apps: StoreApp[]
}

type Tab = 'apps' | 'history'
type StatusFilter = 'all' | 'installed' | 'notInstalled'
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'installed', label: 'Đã cài' },
  { value: 'notInstalled', label: 'Chưa cài' },
]
const CONFIRM_REMOVE = 'Gỡ ứng dụng này khỏi HTX? Dữ liệu được giữ lại.'
const REQUEST_FAILED = 'Không gửi được yêu cầu. Vui lòng thử lại.'

export function AppStoreClient({ initial }: { initial: AppStoreData }) {
  const [data, setData] = useState(initial)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('apps')
  const [historyOpened, setHistoryOpened] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<StoreCategory | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const working = data.apps.some(app => app.status === 'installing' || app.status === 'removing')

  useStorePolling(working, () => fetchJson<{ data: AppStoreData }>('/api/app-store').then(body => setData(body.data)))

  const categories = useMemo(() => Object.keys(CATEGORY_LABELS).filter(key => data.apps.some(app => app.category === key)) as StoreCategory[], [data.apps])
  const visible = useMemo(() => {
    const needle = normalizeSearch(query.trim())
    return data.apps.filter(app => {
      if (category && app.category !== category) return false
      if (statusFilter !== 'all' && INSTALLED_STATUSES.includes(app.status) !== (statusFilter === 'installed')) return false
      return !needle || normalizeSearch(`${app.name} ${app.description}`).includes(needle)
    })
  }, [data.apps, query, category, statusFilter])

  function openTab(next: Tab) {
    setTab(next)
    if (next === 'history') setHistoryOpened(true)
  }

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

      <div className={styles.tabs} role="tablist" aria-label="Kho ứng dụng">
        {(['apps', 'history'] as const).map(value => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`store-tab-${value}`}
            aria-selected={tab === value}
            aria-controls={`store-panel-${value}`}
            className={styles.tab}
            onClick={() => openTab(value)}
          >
            {value === 'apps' ? 'Ứng dụng' : 'Lịch sử'}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="store-panel-apps" aria-labelledby="store-tab-apps" hidden={tab !== 'apps'}>
        {data.apps.length === 0 ? (
          <p className={styles.empty}>Kho chưa có ứng dụng nào.</p>
        ) : (
          <>
            <div className={styles.toolbar}>
              <label className={styles.searchLabel}>
                <span className={styles.srOnly}>Tìm ứng dụng</span>
                <input
                  type="search"
                  className={styles.search}
                  placeholder="Tìm ứng dụng"
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                />
              </label>
              <div className={styles.filters} role="group" aria-label="Lọc theo trạng thái">
                {STATUS_FILTERS.map(filter => (
                  <button
                    key={filter.value}
                    type="button"
                    className={styles.filter}
                    aria-pressed={statusFilter === filter.value}
                    onClick={() => setStatusFilter(filter.value)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              {categories.length > 0 && (
                <div className={styles.filters} role="group" aria-label="Lọc theo danh mục">
                  {categories.map(key => (
                    <button
                      key={key}
                      type="button"
                      className={styles.filter}
                      aria-pressed={category === key}
                      onClick={() => setCategory(category === key ? null : key)}
                    >
                      {CATEGORY_LABELS[key]}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {visible.length === 0 ? (
              <p className={styles.empty}>Không có ứng dụng nào khớp bộ lọc.</p>
            ) : (
              <ul className={styles.grid}>
                {visible.map(app => (
                  <li key={app.id} className={styles.item}>
                    <Card className={styles.card}>
                      <div className={styles.cardHead}>
                        <StoreAppIcon name={app.icon} />
                        <h2 className={styles.name}>
                          <Link href={`/manager/app-store/${app.id}`} className={styles.nameLink}>
                            {app.name}
                          </Link>
                        </h2>
                        <span className={styles.version}>v{app.version}</span>
                      </div>
                      {app.description && <p className={styles.description}>{app.description}</p>}
                      <p className={styles.meta}>
                        {app.category && <>{CATEGORY_LABELS[app.category]} · </>}
                        {app.publisher} · {app.license}
                        {app.roles.length > 0 && <> · Dành cho {app.roles.map(role => ROLE_LABELS[role] ?? role).join(', ')}</>}
                        {app.hasPublic && <> · Có trang công khai</>}
                      </p>
                      <div className={styles.footer}>
                        <Pill tone={STATUS_TONES[app.status]} size="md">
                          {STATUS_LABELS[app.status]}
                        </Pill>
                        {hasNewVersion(app) && (
                          <Pill tone="amber" size="md">
                            {NEW_VERSION_LABEL}
                          </Pill>
                        )}
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
          </>
        )}
      </div>

      <div role="tabpanel" id="store-panel-history" aria-labelledby="store-tab-history" hidden={tab !== 'history'}>
        {historyOpened && <StoreHistory />}
      </div>
    </div>
  )
}
