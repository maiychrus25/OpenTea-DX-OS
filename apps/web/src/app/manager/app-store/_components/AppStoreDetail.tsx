// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button, Pill } from '@/components/ui'
import CopyUrlButton from '@/components/ui/copy-url-button'
import type { AppStoreStatus, StoreAction, StoreAppDetail } from '@/domain/entities/app-store'
import { fetchJson } from '@/lib/api/fetch-json'
import styles from './AppStoreDetail.module.css'
import { InstallProgress } from './InstallProgress'
import { StoreAppIcon } from './StoreAppIcon'
import { StoreHistoryTable } from './StoreHistory'
import { CATEGORY_LABELS, ROLE_LABELS, STATUS_LABELS, STATUS_TONES } from './store-labels'
import { useStorePolling } from './use-store-polling'

const CONFIRM_REMOVE = 'Gỡ ứng dụng này khỏi HTX? Dữ liệu được giữ lại.'
const REQUEST_FAILED = 'Không gửi được yêu cầu. Vui lòng thử lại.'

// Every text below comes from a manifest and is rendered as React text: no HTML, no Markdown.
export function AppStoreDetail({ initial, workerAlive }: { initial: StoreAppDetail; workerAlive: boolean }) {
  const [app, setApp] = useState(initial)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const working = app.status === 'installing' || app.status === 'removing'
  const installed = app.status === 'enabled' || app.status === 'enabled_all'

  useStorePolling(working, () => fetchJson<{ data: StoreAppDetail }>(`/api/app-store/apps/${app.id}`).then(body => setApp(body.data)))

  async function request(action: StoreAction) {
    if (action === 'DISABLE' && !window.confirm(CONFIRM_REMOVE)) return
    setPending(true)
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
      setApp(current => ({ ...current, status, error: null, phase: null }))
    } catch {
      setMessage(REQUEST_FAILED)
    } finally {
      setPending(false)
    }
  }

  const hasData = app.data.length > 0 || app.personalData !== null || app.coreReads.length > 0

  return (
    <div className={styles.container}>
      <Link href="/manager/app-store" className={styles.back}>
        ← Kho ứng dụng
      </Link>

      <header className={styles.header}>
        <StoreAppIcon name={app.icon} size="lg" />
        <div className={styles.headerText}>
          <h1 className={styles.title}>{app.name}</h1>
          <p className={styles.meta}>
            v{app.version} · {app.publisher} · {app.license}
            {app.category && <> · {CATEGORY_LABELS[app.category]}</>}
          </p>
          {app.description && <p className={styles.description}>{app.description}</p>}
        </div>
        <div className={styles.actions}>
          <Pill tone={STATUS_TONES[app.status]} size="md">
            {STATUS_LABELS[app.status]}
          </Pill>
          {app.status === 'available' && <Button isLoading={pending} onClick={() => request('ENABLE')}>Cài</Button>}
          {app.status === 'enabled' && (
            <Button variant="secondary" isLoading={pending} onClick={() => request('DISABLE')}>
              Gỡ
            </Button>
          )}
          {app.status === 'failed' && <Button isLoading={pending} onClick={() => request('ENABLE')}>Thử lại</Button>}
          {installed && app.openHref && (
            <Link href={app.openHref} className={styles.openLink}>
              Mở ứng dụng
            </Link>
          )}
        </div>
      </header>
      {installed && !app.openHref && (
        <p className={styles.audience}>Ứng dụng này dành cho {app.roles.map(role => ROLE_LABELS[role] ?? role).join(', ')}.</p>
      )}
      {message && (
        <p className={styles.error} role="alert">
          {message}
        </p>
      )}

      <InstallProgress status={app.status} phase={app.phase} installedOnServer={app.installedOnServer} error={app.error} workerAlive={workerAlive} />

      {app.screenshots.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.heading}>Ảnh màn hình</h2>
          <ul className={styles.shots}>
            {app.screenshots.map(shot => (
              <li key={shot.position} className={styles.shot}>
                {/* eslint-disable-next-line @next/next/no-img-element -- served by our own route; sizes are not known */}
                <img src={shot.url} alt={shot.caption} loading="lazy" className={styles.shotImage} />
                <span className={styles.shotCaption}>{shot.caption}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {app.about.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.heading}>Giới thiệu</h2>
          {app.about.map((paragraph, index) => (
            <p key={index} className={styles.paragraph}>
              {paragraph}
            </p>
          ))}
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.heading}>Khi cài, ứng dụng sẽ</h2>
        <ul className={styles.list}>
          {app.preview.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      </section>

      {hasData && (
        <section className={styles.section}>
          <h2 className={styles.heading}>Dữ liệu</h2>
          {app.data.length > 0 && (
            <>
              <h3 className={styles.subheading}>Ứng dụng lưu</h3>
              <ul className={styles.list}>
                {app.data.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </>
          )}
          {app.personalData !== null && (
            <>
              <h3 className={styles.subheading}>Dữ liệu cá nhân</h3>
              <p className={styles.paragraph}>{app.personalData}</p>
            </>
          )}
          {app.coreReads.length > 0 && (
            <>
              <h3 className={styles.subheading}>Đọc từ hệ thống</h3>
              <ul className={styles.list}>
                {app.coreReads.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </>
          )}
          <p className={styles.note}>Theo khai báo của nhà phát hành. Gỡ ứng dụng vẫn giữ dữ liệu.</p>
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.heading}>Thông tin</h2>
        <dl className={styles.info}>
          <dt>Phiên bản</dt>
          <dd>{app.version}</dd>
          <dt>Giấy phép</dt>
          <dd>{app.license}</dd>
          <dt>Nhà phát hành</dt>
          <dd>{app.publisher}</dd>
          {app.requiresCore && (
            <>
              <dt>Yêu cầu phiên bản lõi</dt>
              <dd>{app.requiresCore}</dd>
            </>
          )}
          {app.publicUrl && (
            <>
              <dt>Trang công khai</dt>
              <dd>
                <span className={styles.url}>{app.publicUrl}</span>
                <CopyUrlButton url={app.publicUrl} />
              </dd>
            </>
          )}
        </dl>
      </section>

      {app.history.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.heading}>Lịch sử của ứng dụng này</h2>
          <StoreHistoryTable entries={app.history} showApp={false} />
        </section>
      )}
    </div>
  )
}
