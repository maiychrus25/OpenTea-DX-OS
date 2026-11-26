// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Heart, MessageCircle, Music2, Play, Plus, Search, Share2, Trash2, Volume2, VolumeX } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader/PageHeader'
import { SAMPLE_CLIPS, ShortClip, countLabel, handle, initials } from './data'
import { PostDialog } from './PostDialog'
import styles from './shorts.module.css'

// Posted clips outlive moving between pages, but not a reload.
let sessionClips: ShortClip[] = []

export function ShortsPage({ userName }: { userName: string }) {
  const [posted, setPosted] = useState<ShortClip[]>(() => sessionClips)
  const [view, setView] = useState<'feed' | 'mine'>('feed')
  const [tab, setTab] = useState<'following' | 'forYou'>('forYou')
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(true)
  const [progress, setProgress] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [liked, setLiked] = useState<string[]>([])
  const [followed, setFollowed] = useState<string[]>([])
  const [added, setAdded] = useState<Record<string, ShortClip['comments']>>({})
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState('')
  const [posting, setPosting] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const player = useRef<HTMLDivElement>(null)
  const commentInput = useRef<HTMLInputElement>(null)
  const lastScroll = useRef(0)
  const touchStart = useRef<number | null>(null)

  const needle = query.trim().toLowerCase()
  const clips = [...posted, ...SAMPLE_CLIPS].filter(
    (c) => (tab === 'forYou' || followed.includes(c.channel)) && (!needle || `${c.title} ${c.channel} ${c.tags.join(' ')}`.toLowerCase().includes(needle))
  )
  const current = clips.length ? Math.min(index, clips.length - 1) : 0
  const clip: ShortClip | undefined = clips[current]
  const next = clips[current + 1]
  const comments = clip ? [...(added[clip.id] ?? []), ...clip.comments] : []

  const go = useCallback(
    (to: number) => {
      if (to < 0 || to >= clips.length || to === current) return
      setIndex(to)
      setPaused(false)
      setProgress(0)
      setExpanded(false)
      setDraft('')
      setNotice('')
    },
    [clips.length, current]
  )

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) setPaused(true)
  }, [])

  useEffect(() => {
    const element = video.current
    if (!element) return
    element.muted = muted
    if (paused) element.pause()
    else element.play()?.catch(() => setPaused(true))
  }, [clip?.id, paused, muted, view])

  // The wheel moves between clips instead of scrolling the page, one clip per gesture.
  useEffect(() => {
    const element = player.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      const step = Math.sign(event.deltaY)
      if (Math.abs(event.deltaY) < 20 || current + step < 0 || current + step >= clips.length) return
      event.preventDefault()
      if (event.timeStamp - lastScroll.current < 600) return
      lastScroll.current = event.timeStamp
      go(current + step)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [go, current, clips.length, view])

  useEffect(() => {
    if (view !== 'feed' || posting) return
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
      event.preventDefault()
      go(current + (event.key === 'ArrowDown' ? 1 : -1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, current, view, posting])

  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value])

  const restart = () => {
    setIndex(0)
    setProgress(0)
    setNotice('')
  }

  const share = async () => {
    if (!clip) return
    try {
      await navigator.clipboard.writeText(`${clip.title} · ${clip.channel} · Về Xứ Chè`)
      setNotice('Đã chép tiêu đề video để chia sẻ.')
    } catch {
      setNotice('Trình duyệt không cho chép. Hãy thử lại.')
    }
  }

  const send = (event: React.FormEvent) => {
    event.preventDefault()
    const text = draft.trim()
    if (!clip || !text) return
    setAdded((all) => ({
      ...all,
      [clip.id]: [{ id: `${clip.id}-new-${all[clip.id]?.length ?? 0}`, author: userName, when: 'Vừa xong', text }, ...(all[clip.id] ?? [])],
    }))
    setDraft('')
  }

  const keep = (list: ShortClip[]) => {
    sessionClips = list
    setPosted(list)
  }

  const post = (title: string, src: string) => {
    keep([{ id: src, channel: userName, title, tags: [], src, likes: 0, views: 0, comments: [], mine: true }, ...posted])
    setPosting(false)
    setView('feed')
    setTab('forYou')
    setQuery('')
    setSearching(false)
    setPaused(false)
    restart()
  }

  const remove = (target: ShortClip) => {
    if (!window.confirm('Xoá video này?')) return
    URL.revokeObjectURL(target.src)
    keep(posted.filter((c) => c.id !== target.id))
    restart()
  }

  const watch = (target: ShortClip) => {
    setView('feed')
    setTab('forYou')
    setQuery('')
    setSearching(false)
    setIndex(posted.findIndex((c) => c.id === target.id))
    setPaused(false)
  }

  return (
    <div className={styles.page}>
      <PageHeader
        icon={<Play size={26} />}
        title="Video ngắn"
        description="Video đăng chỉ lưu trong phiên này."
        actions={
          <>
            <button type="button" className={styles.secondary} onClick={() => setView(view === 'mine' ? 'feed' : 'mine')}>
              {view === 'mine' ? 'Xem video' : 'Video của tôi'}
            </button>
            <button type="button" className={styles.primary} onClick={() => setPosting(true)}>
              <Plus size={16} aria-hidden="true" /> Đăng video
            </button>
          </>
        }
      />

      {view === 'mine' ? (
        <section className={styles.mine} aria-label="Video của tôi">
          {posted.length === 0 ? (
            <p>Bạn chưa đăng video nào. Bấm “Đăng video” để chia sẻ khoảnh khắc đầu tiên.</p>
          ) : (
            <ul className={styles.grid}>
              {posted.map((c) => (
                <li key={c.id}>
                  <button type="button" className={styles.tile} onClick={() => watch(c)} aria-label={`Xem ${c.title}`}>
                    <video src={c.src} muted playsInline preload="metadata" />
                    <span>{c.title}</span>
                  </button>
                  <button type="button" className={styles.secondary} onClick={() => remove(c)} aria-label={`Xoá ${c.title}`}>
                    <Trash2 size={15} aria-hidden="true" /> Xoá
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className={styles.stage} aria-label="Xem video ngắn">
          <div className={styles.column}>
            <div
              ref={player}
              className={styles.player}
              onTouchStart={(event) => (touchStart.current = event.touches[0].clientY)}
              onTouchEnd={(event) => {
                const from = touchStart.current
                const moved = from === null ? 0 : from - event.changedTouches[0].clientY
                if (Math.abs(moved) > 50) go(current + Math.sign(moved))
              }}
            >
              {clip ? (
                <>
                  <video
                    key={clip.id}
                    ref={video}
                    className={styles.video}
                    src={clip.src}
                    poster={clip.poster}
                    loop
                    muted={muted}
                    playsInline
                    onTimeUpdate={(event) => setProgress(event.currentTarget.currentTime / event.currentTarget.duration || 0)}
                  />
                  <button type="button" className={styles.surface} onClick={() => setPaused(!paused)} aria-label={paused ? 'Phát video' : 'Tạm dừng video'}>
                    {paused && <span className={styles.bigPlay}><Play size={28} fill="currentColor" aria-hidden="true" /></span>}
                  </button>
                </>
              ) : (
                <p className={styles.empty}>
                  {needle ? 'Không tìm thấy video phù hợp.' : 'Bạn chưa theo dõi kênh nào. Mở “Dành cho bạn” và bấm dấu + để theo dõi.'}
                </p>
              )}

              <div className={styles.top}>
                <button
                  type="button"
                  className={styles.icon}
                  aria-label="Tìm video"
                  aria-expanded={searching}
                  onClick={() => {
                    setSearching(!searching)
                    setQuery('')
                    restart()
                  }}
                >
                  <Search size={20} aria-hidden="true" />
                </button>
                <div className={styles.tabs}>
                  {(['following', 'forYou'] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={tab === key}
                      onClick={() => {
                        setTab(key)
                        restart()
                      }}
                    >
                      {key === 'following' ? 'Theo dõi' : 'Dành cho bạn'}
                    </button>
                  ))}
                </div>
                <button type="button" className={styles.icon} aria-label={muted ? 'Bật tiếng' : 'Tắt tiếng'} onClick={() => setMuted(!muted)}>
                  {muted ? <VolumeX size={20} aria-hidden="true" /> : <Volume2 size={20} aria-hidden="true" />}
                </button>
              </div>
              {searching && (
                <input
                  className={styles.search}
                  autoFocus
                  type="search"
                  aria-label="Từ khoá tìm video"
                  placeholder="Tìm theo tiêu đề hoặc kênh…"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value)
                    restart()
                  }}
                />
              )}

              {clip && (
                <>
                  <div className={styles.rail}>
                    <div className={styles.channel}>
                      <span className={styles.channelAvatar} aria-hidden="true">{initials(clip.channel)}</span>
                      {!clip.mine && (
                        <button
                          type="button"
                          className={styles.follow}
                          aria-label={`Theo dõi ${clip.channel}`}
                          aria-pressed={followed.includes(clip.channel)}
                          onClick={() => setFollowed(toggle(followed, clip.channel))}
                        >
                          {followed.includes(clip.channel) ? <Check size={12} aria-hidden="true" /> : <Plus size={12} aria-hidden="true" />}
                        </button>
                      )}
                    </div>
                    <button type="button" className={styles.action} aria-label="Thả tim" aria-pressed={liked.includes(clip.id)} onClick={() => setLiked(toggle(liked, clip.id))}>
                      <span><Heart size={22} fill={liked.includes(clip.id) ? 'currentColor' : 'none'} aria-hidden="true" /></span>
                      {countLabel(clip.likes + (liked.includes(clip.id) ? 1 : 0))}
                    </button>
                    <button type="button" className={styles.action} aria-label="Bình luận" onClick={() => commentInput.current?.focus()}>
                      <span><MessageCircle size={22} fill="currentColor" aria-hidden="true" /></span>
                      {countLabel(comments.length)}
                    </button>
                    <button type="button" className={styles.action} onClick={share}>
                      <span><Share2 size={22} aria-hidden="true" /></span>
                      Chia sẻ
                    </button>
                  </div>

                  <div className={styles.caption}>
                    <strong>{handle(clip.channel)}</strong>
                    <p className={expanded ? undefined : styles.clamp}>
                      {clip.title} {clip.tags.map((t) => <b key={t}>#{t} </b>)}
                      {expanded && <span>· {countLabel(clip.views)} lượt xem</span>}
                    </p>
                    <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
                      {expanded ? 'thu gọn' : 'xem thêm'}
                    </button>
                    <span className={styles.sound}><Music2 size={13} aria-hidden="true" /> Âm thanh gốc · {clip.channel}</span>
                  </div>
                  <div className={styles.progress} aria-hidden="true"><span style={{ width: `${progress * 100}%` }} /></div>
                </>
              )}
              <p role="status" className={styles.notice}>{notice}</p>
            </div>
            <div className={styles.peek} aria-hidden="true" style={next?.poster ? { backgroundImage: `url(${next.poster})` } : undefined} />
          </div>

          <div className={styles.arrows}>
            <button type="button" aria-label="Video trước" disabled={current === 0} onClick={() => go(current - 1)}>
              <ChevronUp size={20} aria-hidden="true" />
            </button>
            <button type="button" aria-label="Video tiếp theo" disabled={current >= clips.length - 1} onClick={() => go(current + 1)}>
              <ChevronDown size={20} aria-hidden="true" />
            </button>
          </div>

          <aside className={styles.comments} aria-label="Bình luận">
            <h2>Bình luận · {comments.length}</h2>
            <ul>
              {comments.map((c) => (
                <li key={c.id}>
                  <span className={styles.commentAvatar} aria-hidden="true">{initials(c.author)}</span>
                  <p>
                    <strong>{c.author}</strong> <small>· {c.when}</small>
                    <br />
                    {c.text}
                  </p>
                </li>
              ))}
              {clip && comments.length === 0 && <li>Chưa có bình luận. Hãy là người đầu tiên!</li>}
            </ul>
            <form onSubmit={send}>
              <input ref={commentInput} aria-label="Viết bình luận" placeholder="Viết bình luận…" maxLength={300} value={draft} disabled={!clip} onChange={(event) => setDraft(event.target.value)} />
              <button type="submit" className={styles.primary} disabled={!clip || !draft.trim()}>Gửi bình luận</button>
            </form>
          </aside>
        </section>
      )}

      {posting && <PostDialog onClose={() => setPosting(false)} onPost={post} />}
    </div>
  )
}
