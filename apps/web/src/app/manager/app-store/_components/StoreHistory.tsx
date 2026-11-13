// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import { useEffect, useState } from 'react'
import { Pill, Skeleton } from '@/components/ui'
import type { StoreHistoryEntry } from '@/domain/entities/app-store'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import styles from './AppStoreClient.module.css'
import { REQUEST_LABELS, REQUEST_TONES } from './store-labels'

// A fixed zone keeps the server and the browser rendering the same text.
const TIME = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' })
export const EMPTY_HISTORY = 'Chưa có yêu cầu cài hoặc gỡ nào.'

/** The requests as a table that scrolls inside itself on a narrow screen. */
export function StoreHistoryTable({ entries, showApp = true }: { entries: StoreHistoryEntry[]; showApp?: boolean }) {
  if (entries.length === 0) return <p className={styles.empty}>{EMPTY_HISTORY}</p>
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Thời điểm</th>
            {showApp && <th scope="col">Ứng dụng</th>}
            <th scope="col">Yêu cầu</th>
            <th scope="col">Người yêu cầu</th>
            <th scope="col">Kết quả</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(entry => (
            <tr key={entry.id}>
              <td>{TIME.format(new Date(entry.createdAt))}</td>
              {showApp && <td>{entry.appName}</td>}
              <td>{entry.action === 'ENABLE' ? 'Cài' : 'Gỡ'}</td>
              <td>{entry.requestedByName ?? '—'}</td>
              <td>
                <Pill tone={REQUEST_TONES[entry.status]}>{REQUEST_LABELS[entry.status]}</Pill>
                {entry.status === 'FAILED' && entry.error && <span className={styles.rowError}>{entry.error}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The "Lịch sử" tab: the 50 newest requests of the HTX, loaded when it is mounted. */
export function StoreHistory() {
  const [entries, setEntries] = useState<StoreHistoryEntry[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    fetchJson<{ data: StoreHistoryEntry[] }>('/api/app-store/history')
      .then(body => setEntries(body.data))
      .catch(() => setFailed(true))
  }, [])

  if (failed) {
    return (
      <p className={styles.error} role="alert">
        {LOAD_FAILED_MESSAGE}
      </p>
    )
  }
  if (!entries) {
    return (
      <div aria-busy="true" aria-label="Đang tải">
        <Skeleton variant="rect" height={120} />
      </div>
    )
  }
  return <StoreHistoryTable entries={entries} />
}
