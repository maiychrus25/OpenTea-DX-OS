// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { useCallback, useEffect, useRef, useState } from 'react'
import { get, update } from 'idb-keyval'

export interface JournalPayload {
  client_id?: string
  parcel_id: string
  entry_date: string
  observation?: string
  activities: Record<string, unknown>[]
  photo_url?: string
  photo_minio_key?: string
}

interface QueueItem {
  client_id: string
  payload: JournalPayload
  photo?: Blob
  created_at: number
  last_error?: string
}

export const JOURNAL_QUEUE_KEY = 'journal_offline_queue'
export const QUEUED_MESSAGE = 'Đã lưu trên máy, sẽ tự gửi khi có mạng.'

/** 4xx other than these means the server will never accept the entry as it is. */
const RETRYABLE_CLIENT_ERRORS = [401, 408, 429]

const readQueue = async (): Promise<QueueItem[]> => {
  try { return (await get<QueueItem[]>(JOURNAL_QUEUE_KEY)) ?? [] } catch { return [] }
}
// idb-keyval's update is one IndexedDB transaction, so two tabs or two hooks cannot overwrite each other.
const changeQueue = (fn: (queue: QueueItem[]) => QueueItem[]) => update<QueueItem[]>(JOURNAL_QUEUE_KEY, queue => fn(queue ?? []))

/** Presigns and uploads a journal photo straight to storage; returns its key. Throws a plain Error for a refusal. */
export async function uploadJournalPhoto(photo: Blob & { name?: string }): Promise<string> {
  const ext = photo.name?.split('.').pop() || 'jpg'
  const presign = await fetch('/api/journal/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: `journal-${Date.now()}.${ext}`, contentType: photo.type }),
  })
  if (!presign.ok) throw new Error('Không thể lấy đường dẫn tải ảnh')
  const { data: { uploadUrl, key } } = await presign.json()
  const upload = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': photo.type }, body: photo })
  if (!upload.ok) throw new Error('Lỗi tải ảnh lên hệ thống')
  return key
}

async function errorMessage(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}))
  return body?.error?.message || `Máy chủ từ chối nhật ký (${res.status})`
}

/** Sends every waiting item once. Shared by every hook instance so two mounts never double-send. */
let inFlight: Promise<boolean> | null = null
function replayQueue(): Promise<boolean> {
  if (inFlight) return inFlight
  inFlight = (async () => {
    let sent = false
    for (const item of await readQueue()) {
      if (item.last_error) continue // waits for the farmer to fix or drop it
      try {
        let payload = item.payload
        if (item.photo && !payload.photo_minio_key) {
          const key = await uploadJournalPhoto(item.photo)
          payload = { ...payload, photo_minio_key: key, photo_url: key }
          // Keep the uploaded key so a retry after a failed POST does not upload the photo again.
          await changeQueue(q => q.map(i => i.client_id === item.client_id ? { ...i, payload } : i))
        }
        const res = await fetch('/api/journal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, client_id: item.client_id }),
        })
        if (res.ok) {
          sent = true
          await changeQueue(q => q.filter(i => i.client_id !== item.client_id))
        } else if (res.status >= 400 && res.status < 500 && !RETRYABLE_CLIENT_ERRORS.includes(res.status)) {
          const last_error = await errorMessage(res)
          await changeQueue(q => q.map(i => i.client_id === item.client_id ? { ...i, last_error } : i))
        }
        // 5xx and the retryable 4xx stay for the next round.
      } catch {
        break // offline again: keep the rest in order
      }
    }
    return sent
  })().finally(() => { inFlight = null })
  return inFlight
}

export function useJournalOfflineQueue(options?: { onSent?: () => void }) {
  const [pending, setPending] = useState(0)
  const [failed, setFailed] = useState<{ client_id: string; last_error: string; payload: JournalPayload }[]>([])
  const onSent = useRef(options?.onSent)
  useEffect(() => { onSent.current = options?.onSent })

  const refresh = useCallback(async () => {
    const queue = await readQueue()
    setPending(queue.filter(i => !i.last_error).length)
    setFailed(queue.filter(i => i.last_error).map(i => ({ client_id: i.client_id, last_error: i.last_error!, payload: i.payload })))
  }, [])

  const flush = useCallback(async () => {
    const sent = await replayQueue()
    await refresh()
    if (sent) onSent.current?.()
  }, [refresh])

  const enqueue = useCallback(async (payload: JournalPayload, photo?: Blob) => {
    const client_id = payload.client_id ?? crypto.randomUUID()
    const item: QueueItem = { client_id, payload: { ...payload, client_id }, photo, created_at: Date.now() }
    // One entry per client_id: queuing the same form twice keeps a single copy.
    await changeQueue(q => [...q.filter(i => i.client_id !== client_id), item])
    await refresh()
  }, [refresh])

  const discard = useCallback(async (clientId: string) => {
    await changeQueue(q => q.filter(i => i.client_id !== clientId))
    await refresh()
  }, [refresh])

  useEffect(() => {
    void refresh().then(() => { if (navigator.onLine) void flush() })
    const handleOnline = () => { void flush() }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [refresh, flush])

  return { pending, failed, enqueue, flush, discard }
}
