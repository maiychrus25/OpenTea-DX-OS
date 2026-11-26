// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Bookmark, ChevronDown, ChevronUp, Heart, MessageCircle, MoreHorizontal, Music2, Pause, Play, Plus, Share2, Trash2, User, Volume2, VolumeX } from 'lucide-react'
import { CommentsPanel } from './CommentsPanel'
import { PostDialog } from './PostDialog'
import { Reel, ReelComment, SAMPLE_REELS, clock, countLabel, handle, initials } from './data'
import styles from './reels.module.css'

const SPEEDS = [1, 1.5, 2, 0.5]

// Posted clips outlive moving between pages, but not a reload.
let sessionReels: Reel[] = []

export function ReelsPage({ userName, role }: { userName: string; role: 'farmer' | 'officer' | 'manager' }) {
  const [posted, setPosted] = useState<Reel[]>(() => sessionReels)
  const [view, setView] = useState<'feed' | 'profile'>('feed')
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [autoNext, setAutoNext] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [panel, setPanel] = useState(false)
  const [menu, setMenu] = useState(false)
  const [translated, setTranslated] = useState(false)
  const [liked, setLiked] = useState<string[]>([])
  const [saved, setSaved] = useState<string[]>([])
  const [shared, setShared] = useState<string[]>([])
  const [followed, setFollowed] = useState<string[]>([])
  const [added, setAdded] = useState<Record<string, ReelComment[]>>({})
  const [notice, setNotice] = useState('')
  const [posting, setPosting] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const player = useRef<HTMLDivElement>(null)
  const lastScroll = useRef(0)
  const touchStart = useRef<number | null>(null)

  const reels = [...posted, ...SAMPLE_REELS]
  const mine = reels.filter((r) => r.mine)
  const current = Math.min(index, reels.length - 1)
  const reel = reels[current]
  const isLiked = liked.includes(reel.id)
  const isSaved = saved.includes(reel.id)
  const isFollowed = followed.includes(reel.channel)

  const go = useCallback(
    (to: number) => {
      if (to < 0 || to >= reels.length || to === current) return
      setIndex(to)
      setPaused(false)
      setTime(0)
      setDuration(0)
      setTranslated(false)
      setMenu(false)
      setNotice('')
    },
    [reels.length, current]
  )

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) setPaused(true)
  }, [])

  useEffect(() => {
    const element = video.current
    if (!element) return
    // The server-rendered video may have loaded before React could hear it.
    if (element.duration) setDuration(element.duration)
    element.muted = muted
    element.playbackRate = speed
    if (paused) element.pause()
    else element.play()?.catch(() => setPaused(true))
  }, [reel.id, paused, muted, speed, view])

  // The wheel moves between reels instead of scrolling the page, one reel per gesture.
  useEffect(() => {
    const element = player.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      const step = Math.sign(event.deltaY)
      if (Math.abs(event.deltaY) < 20 || current + step < 0 || current + step >= reels.length) return
      event.preventDefault()
      if (event.timeStamp - lastScroll.current < 600) return
      lastScroll.current = event.timeStamp
      go(current + step)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [go, current, reels.length, view])

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

  const copy = async () => {
    setMenu(false)
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#${reel.id}`)
      setShared((list) => (list.includes(reel.id) ? list : [...list, reel.id]))
      setNotice('Đã sao chép liên kết.')
    } catch {
      setNotice('Trình duyệt không cho sao chép. Hãy thử lại.')
    }
  }

  const watch = (target: Reel) => {
    const to = reels.findIndex((r) => r.id === target.id)
    setView('feed')
    go(to)
    setPaused(false)
  }

  const keep = (list: Reel[]) => {
    sessionReels = list
    setPosted(list)
  }

  const post = (title: string, src: string) => {
    keep([{ id: src, channel: userName, title, tags: [], when: 'Vừa xong', src, likes: 0, commentCount: 0, saves: 0, shares: 0, comments: [], mine: true, posted: true }, ...posted])
    setPosting(false)
    setView('feed')
    setIndex(0)
    setTime(0)
    setPaused(false)
  }

  const remove = (target: Reel) => {
    if (!window.confirm('Xoá video này?')) return
    URL.revokeObjectURL(target.src)
    keep(posted.filter((r) => r.id !== target.id))
    setIndex(0)
  }

  return (
    <div className={styles.page} data-reels={view}>
      {view === 'profile' ? (
        <section aria-label="Cá nhân" className={styles.profile}>
          <button type="button" className={styles.round} aria-label="Quay lại Reels" onClick={() => setView('feed')}>
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          <div className={styles.profileInner}>
            <span className={styles.profileAvatar} aria-hidden="true">{initials(userName)}</span>
            <h1>{userName}</h1>
            <p className={styles.profileHandle}>@{handle(userName)}</p>
            <dl className={styles.profileStats}>
              <div><dt>Video</dt><dd>{mine.length}</dd></div>
              <div><dt>Lượt tim</dt><dd>{countLabel(mine.reduce((sum, r) => sum + r.likes + (liked.includes(r.id) ? 1 : 0), 0))}</dd></div>
              <div><dt>Đang theo dõi</dt><dd>{followed.length}</dd></div>
            </dl>
            <button type="button" className={styles.post} onClick={() => setPosting(true)}>
              <Plus size={18} aria-hidden="true" /> Đăng video
            </button>
            <p className={styles.profileNote}>Video đăng chỉ lưu trong phiên này.</p>

            <h2>Video của tôi</h2>
            <ul className={styles.grid}>
              {mine.map((r) => (
                <li key={r.id}>
                  <button type="button" className={styles.tile} onClick={() => watch(r)} aria-label={`Xem ${r.title}`}>
                    <video src={r.src} poster={r.poster} muted playsInline preload="metadata" />
                    <span className={styles.tileText}>
                      <strong>{r.title}</strong>
                      <span><Heart size={11} fill="currentColor" aria-hidden="true" /> {countLabel(r.likes)}</span>
                    </span>
                  </button>
                  {r.posted && (
                    <button type="button" className={styles.remove} onClick={() => remove(r)} aria-label={`Xoá ${r.title}`}>
                      <Trash2 size={14} aria-hidden="true" /> Xoá
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : (
        <section className={styles.stage} aria-label="Xem Reels">
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
            <div className={styles.backdrop} aria-hidden="true" style={reel.poster ? { backgroundImage: `url(${reel.poster})` } : undefined} />
            <video
              key={reel.id}
              ref={video}
              className={styles.video}
              src={reel.src}
              poster={reel.poster}
              loop={!autoNext}
              muted={muted}
              playsInline
              onDurationChange={(event) => setDuration(event.currentTarget.duration)}
              onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
              onEnded={() => (current < reels.length - 1 ? go(current + 1) : setPaused(true))}
            />
            <button type="button" className={styles.surface} onClick={() => setPaused(!paused)} aria-label={paused ? 'Phát video' : 'Tạm dừng video'}>
              <span className={styles.bigPlay} data-playing={!paused}><Play size={22} fill="currentColor" aria-hidden="true" /></span>
            </button>

            <Link href={`/${role}/dashboard`} className={`${styles.round} ${styles.exit}`} aria-label="Thoát Reels">
              <ArrowLeft size={20} aria-hidden="true" />
            </Link>
            <button type="button" className={styles.me} onClick={() => setView('profile')}>
              <User size={17} aria-hidden="true" /> Cá nhân
            </button>

            <div className={styles.side}>
              <div className={styles.arrows}>
                <button type="button" aria-label="Video trước" disabled={current === 0} onClick={() => go(current - 1)}>
                  <ChevronUp size={18} aria-hidden="true" />
                </button>
                <button type="button" aria-label="Video tiếp theo" disabled={current >= reels.length - 1} onClick={() => go(current + 1)}>
                  <ChevronDown size={18} aria-hidden="true" />
                </button>
              </div>
              <button type="button" className={styles.action} aria-label="Thả tim" aria-pressed={isLiked} onClick={() => setLiked(toggle(liked, reel.id))}>
                <Heart size={24} fill="currentColor" aria-hidden="true" />
                {countLabel(reel.likes + (isLiked ? 1 : 0))}
              </button>
              <button type="button" className={styles.action} aria-label="Bình luận" aria-expanded={panel} onClick={() => setPanel(!panel)}>
                <MessageCircle size={24} fill="currentColor" aria-hidden="true" />
                {reel.commentCount + (added[reel.id]?.length ?? 0)}
              </button>
              <button type="button" className={styles.action} aria-label="Lưu video" aria-pressed={isSaved} onClick={() => setSaved(toggle(saved, reel.id))}>
                <Bookmark size={24} fill="currentColor" aria-hidden="true" />
                {countLabel(reel.saves + (isSaved ? 1 : 0))}
              </button>
              <button type="button" className={styles.action} aria-label="Chia sẻ" onClick={copy}>
                <Share2 size={24} fill="currentColor" aria-hidden="true" />
                {countLabel(reel.shares + (shared.includes(reel.id) ? 1 : 0))}
              </button>
            </div>

            <div className={styles.caption}>
              <span className={styles.sound}><Music2 size={12} aria-hidden="true" /> Âm thanh gốc · {reel.channel}</span>
              <div className={styles.who}>
                <span className={styles.avatar} aria-hidden="true">{initials(reel.channel)}</span>
                <strong>{handle(reel.channel)}</strong>
                {!reel.posted && (
                  <button type="button" className={styles.followButton} aria-pressed={isFollowed} onClick={() => setFollowed(toggle(followed, reel.channel))}>
                    {isFollowed ? 'Đang theo dõi' : 'Theo dõi'}
                  </button>
                )}
              </div>
              <p>{reel.title} {reel.tags.map((t) => <b key={t}>#{t} </b>)}</p>
              {translated && <p lang="en">{reel.translation}</p>}
              {reel.translation && (
                <button type="button" className={styles.translate} onClick={() => setTranslated(!translated)}>
                  {translated ? 'Ẩn bản dịch' : 'Xem bản dịch'}
                </button>
              )}
            </div>

            <div className={styles.controls}>
              <input
                type="range"
                className={styles.seek}
                aria-label="Tua video"
                min={0}
                max={duration || 0}
                step={0.05}
                value={Math.min(time, duration || 0)}
                style={{ '--played': `${duration ? (time / duration) * 100 : 0}%` } as React.CSSProperties}
                onChange={(event) => {
                  const to = Number(event.target.value)
                  if (video.current) video.current.currentTime = to
                  setTime(to)
                }}
              />
              <div className={styles.bar}>
                <button type="button" aria-label={paused ? 'Tiếp tục phát' : 'Dừng'} onClick={() => setPaused(!paused)}>
                  {paused ? <Play size={17} fill="currentColor" aria-hidden="true" /> : <Pause size={17} fill="currentColor" aria-hidden="true" />}
                </button>
                <span>{clock(time)} / {clock(duration)}</span>
                <span className={styles.spacer} />
                <button type="button" role="switch" aria-checked={autoNext} className={styles.auto} onClick={() => setAutoNext(!autoNext)}>
                  <span>Cuộn tự động</span> <i aria-hidden="true" />
                </button>
                <button type="button" aria-label="Tốc độ phát" onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}>
                  {speed.toFixed(1)}x
                </button>
                <button type="button" aria-label={muted ? 'Bật tiếng' : 'Tắt tiếng'} onClick={() => setMuted(!muted)}>
                  {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
                </button>
                <button type="button" aria-label="Thêm tuỳ chọn" aria-expanded={menu} onClick={() => setMenu(!menu)}>
                  <MoreHorizontal size={18} aria-hidden="true" />
                </button>
              </div>
            </div>
            {menu && (
              <div className={styles.menu}>
                <button type="button" onClick={copy}>Sao chép liên kết</button>
                <button
                  type="button"
                  onClick={() => {
                    setMenu(false)
                    player.current?.requestFullscreen?.()
                  }}
                >
                  Toàn màn hình
                </button>
              </div>
            )}
            <p role="status" className={styles.notice}>{notice}</p>
          </div>

          {panel && (
            <CommentsPanel
              key={reel.id}
              reel={reel}
              added={added[reel.id] ?? []}
              userName={userName}
              channelReels={reels.filter((r) => r.channel === reel.channel)}
              likes={reel.likes + (isLiked ? 1 : 0)}
              liked={isLiked}
              following={isFollowed}
              onLike={() => setLiked(toggle(liked, reel.id))}
              onFollow={() => setFollowed(toggle(followed, reel.channel))}
              onCopy={copy}
              onAdd={(comments) => setAdded((all) => ({ ...all, [reel.id]: comments }))}
              onWatch={watch}
            />
          )}
        </section>
      )}

      {posting && <PostDialog onClose={() => setPosting(false)} onPost={post} />}
    </div>
  )
}
