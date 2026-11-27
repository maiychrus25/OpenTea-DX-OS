// SPDX-License-Identifier: MIT
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useRef, useState } from 'react'
import { Heart, MessageCircle, Music2 } from 'lucide-react'
import { Reel, ReelComment, countLabel, handle, initials } from './data'
import styles from './reels.module.css'

interface Props {
  reel: Reel
  /** Comments written in this session, newest first. */
  added: ReelComment[]
  userName: string
  likes: number
  liked: boolean
  following: boolean
  onLike: () => void
  onFollow: () => void
  onCopy: () => void
  onAdd: (comments: ReelComment[]) => void
}

export function CommentsPanel({ reel, added, userName, likes, liked, following, onLike, onFollow, onCopy, onAdd }: Props) {
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<ReelComment | null>(null)
  const [open, setOpen] = useState<string[]>([])
  const [hearted, setHearted] = useState<string[]>([])
  const [replies, setReplies] = useState<Record<string, ReelComment['replies']>>({})
  const input = useRef<HTMLInputElement>(null)

  const comments = [...added, ...reel.comments]
  const total = reel.commentCount + added.length
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  const send = (event: React.FormEvent) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    if (replyTo) {
      setReplies((all) => ({ ...all, [replyTo.id]: [...(all[replyTo.id] ?? []), { id: `${replyTo.id}-new-${all[replyTo.id]?.length ?? 0}`, author: userName, text }] }))
      if (!open.includes(replyTo.id)) setOpen([...open, replyTo.id])
      setReplyTo(null)
    } else {
      onAdd([{ id: `${reel.id}-new-${added.length}`, author: userName, when: 'Vừa xong', text, likes: 0, replies: [] }, ...added])
    }
    setDraft('')
  }

  return (
    <aside className={styles.panel} aria-label="Bình luận">
      <h2 className={styles.panelTitle}>Bình luận ({total})</h2>

      <div className={styles.panelScroll}>
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.avatar} aria-hidden="true">{initials(reel.channel)}</span>
            <p>
              <strong>{handle(reel.channel)}</strong>
              <small>{reel.channel} · {reel.when}</small>
            </p>
            {!reel.posted && (
              <button type="button" className={styles.followButton} aria-pressed={following} onClick={onFollow}>
                {following ? 'Đang theo dõi' : 'Theo dõi'}
              </button>
            )}
          </div>
          <p className={styles.cardText}>{reel.title} {reel.tags.map((t) => <b key={t}>#{t} </b>)}</p>
          <small className={styles.cardSound}><Music2 size={12} aria-hidden="true" /> Âm thanh gốc · {reel.channel}</small>
        </div>

        <div className={styles.stats}>
          <button type="button" aria-pressed={liked} aria-label="Tim video này" onClick={onLike}>
            <Heart size={16} fill={liked ? 'currentColor' : 'none'} aria-hidden="true" /> {countLabel(likes)}
          </button>
          <span><MessageCircle size={16} aria-hidden="true" /> {total}</span>
          <button type="button" className={styles.copy} onClick={onCopy}>Sao chép liên kết</button>
        </div>

        <ul className={styles.commentList}>
          {comments.map((c) => {
            const all = [...c.replies, ...(replies[c.id] ?? [])]
            const mine = hearted.includes(c.id)
            return (
              <li key={c.id}>
                <span className={styles.commentAvatar} aria-hidden="true">{initials(c.author)}</span>
                <div>
                  <strong>{c.author}</strong>
                  <p>{c.text}</p>
                  <div className={styles.meta}>
                    <span>{c.when}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setReplyTo(c)
                        input.current?.focus()
                      }}
                    >
                      Trả lời
                    </button>
                  </div>
                  {all.length > 0 && (
                    <button type="button" className={styles.more} aria-expanded={open.includes(c.id)} onClick={() => setOpen(toggle(open, c.id))}>
                      —— {open.includes(c.id) ? 'Ẩn câu trả lời' : `Xem ${all.length} câu trả lời`}
                    </button>
                  )}
                  {open.includes(c.id) && all.map((r) => (
                    <p key={r.id} className={styles.reply}><strong>{r.author}</strong> {r.text}</p>
                  ))}
                </div>
                <button type="button" className={styles.commentLike} aria-label={`Tim bình luận của ${c.author}`} aria-pressed={mine} onClick={() => setHearted(toggle(hearted, c.id))}>
                  <Heart size={14} fill={mine ? 'currentColor' : 'none'} aria-hidden="true" />
                  {c.likes + (mine ? 1 : 0)}
                </button>
              </li>
            )
          })}
          {comments.length === 0 && <li>Chưa có bình luận. Hãy là người đầu tiên!</li>}
        </ul>
      </div>

      {replyTo && (
        <p className={styles.replying}>
          Đang trả lời {replyTo.author}
          <button type="button" onClick={() => setReplyTo(null)}>Huỷ</button>
        </p>
      )}
      <form className={styles.compose} onSubmit={send}>
        <input ref={input} aria-label="Thêm bình luận" placeholder="Thêm bình luận..." maxLength={300} value={draft} onChange={(event) => setDraft(event.target.value)} />
        <button type="submit" disabled={!draft.trim()}>Đăng</button>
      </form>
    </aside>
  )
}
