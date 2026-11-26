// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect, useRef, useState } from 'react'
import styles from './shorts.module.css'

const MAX_SECONDS = 60

/** Pick a video from the computer, name it and add it to the feed for this session. */
export function PostDialog({ onClose, onPost }: { onClose: () => void; onPost: (title: string, src: string) => void }) {
  const [src, setSrc] = useState('')
  const [title, setTitle] = useState('')
  const [seconds, setSeconds] = useState<number | null>(null)
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const posted = useRef(false)

  useEffect(() => {
    dialog.current?.showModal?.()
  }, [])
  // A picked file that was never posted is released again.
  useEffect(() => () => {
    if (src && !posted.current) URL.revokeObjectURL(src)
  }, [src])

  const pick = (file?: File) => {
    setSeconds(null)
    setError('')
    setSrc(file ? URL.createObjectURL(file) : '')
  }

  const ready = Boolean(src) && seconds !== null && seconds <= MAX_SECONDS && Boolean(title.trim())

  return (
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="post-video-title" onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!ready) return
          posted.current = true
          onPost(title.trim(), src)
        }}
      >
        <h2 id="post-video-title">Đăng video</h2>
        <label className={styles.field}>
          Chọn video
          <input type="file" accept="video/*" onChange={(event) => pick(event.target.files?.[0])} />
        </label>
        {src && (
          <video
            className={styles.preview}
            src={src}
            controls
            muted
            playsInline
            onLoadedMetadata={(event) => {
              const length = event.currentTarget.duration
              setSeconds(length)
              setError(length > MAX_SECONDS ? 'Video dài quá 60 giây. Hãy chọn video khác.' : '')
            }}
            onError={() => setError('Không đọc được tệp này. Hãy chọn video khác.')}
          />
        )}
        <label className={styles.field}>
          Tiêu đề video
          <input value={title} maxLength={80} placeholder="Một khoảnh khắc ở xứ chè…" onChange={(event) => setTitle(event.target.value)} />
        </label>
        <p className={styles.hint}>Video tối đa 60 giây, chỉ lưu trong phiên này. Chỉ chia sẻ nội dung bạn có quyền sử dụng.</p>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className={styles.dialogActions}>
          <button type="button" className={styles.secondary} onClick={onClose}>Huỷ</button>
          <button type="submit" className={styles.primary} disabled={!ready}>Đăng</button>
        </div>
      </form>
    </dialog>
  )
}
