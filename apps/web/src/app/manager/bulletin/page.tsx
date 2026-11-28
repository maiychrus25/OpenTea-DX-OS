// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import Link from 'next/link'
import { CalendarDays, ChevronLeft, ChevronRight, FileText, Leaf, Megaphone, Plus, Search, Sprout, TrendingUp, Users } from 'lucide-react'
import { AiNote } from '@/components/ui/AiNote'
import { PageHeader } from '@/components/ui/PageHeader'
import { WeatherSection } from '@/components/features/bulletin/WeatherSection'
import { ListenBulletinButton } from '@/components/features/bulletin/ListenBulletinButton'
import { Sample } from '@/components/features/manager-web/parts'
import ui from '@/components/features/manager-web/kit.module.css'
import kit from '@/components/features/dashboard/page-kit.module.css'
import { auth } from '@/auth'
import { prisma } from '@/infrastructure/db/prisma.client'
import styles from './_components/bulletin.module.css'

export const dynamic = 'force-dynamic'

function timeAgo(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) return 'Vừa xong'
  if (hours < 24) return `${hours} giờ trước`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Hôm qua'
  return `${days} ngày trước`
}

interface ManagerBulletinPageProps {
  searchParams?: {
    category?: string
    q?: string
    page?: string
  }
}

/**
 * Strip LLM thinking blocks (e.g. <think>...</think>) from AI-generated text.
 * Qwen 3 and similar reasoning models emit these traces in responses.
 */
function stripThinkingBlocks(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*/gi, '') // unclosed thinking block
    .trim()
}

const CATEGORIES = [
  { key: 'activity', label: 'Hoạt động HTX', icon: <Users size={18} /> },
  { key: 'production', label: 'Sản xuất', icon: <Sprout size={18} /> },
  { key: 'event', label: 'Sự kiện', icon: <CalendarDays size={18} /> },
  { key: 'notice', label: 'Thông báo', icon: <Megaphone size={18} /> },
  { key: 'market', label: 'Thị trường', icon: <TrendingUp size={18} /> },
]

/** The design's posts. The cooperative cannot write posts yet, so they only show the layout. */
const SAMPLES = [
  { category: 'activity', headline: 'HTX tổng kết vụ xuân', summary: 'Hội nghị đánh giá kết quả sản xuất, thu mua và kế hoạch vụ hè.', image: '/images/tea-hills-sunrise.jpg' },
  { category: 'production', headline: 'Chăm sóc chè sau thu hái', summary: 'Một số lưu ý chung về cắt tỉa và theo dõi nương chè sau mỗi lứa.', image: '/images/tea-hills-mist.jpg' },
  { category: 'event', headline: 'HTX tham gia lễ hội trà', summary: 'Trưng bày và giới thiệu sản phẩm của HTX tại lễ hội trà.', image: '/images/tea-hills-rain.jpg' },
]

const PAGE = 4
const labelOf = (key: string) => CATEGORIES.find((c) => c.key === key)?.label ?? key

export default async function ManagerBulletinPage({ searchParams }: ManagerBulletinPageProps) {
  const category = searchParams?.category || 'all'
  const q = (searchParams?.q ?? '').trim()

  // Load bulletins from DB: published, and the cooperative's own or shared rows
  const htxCode = (await auth())?.user?.htxCode ?? ''
  const dbBulletins = await prisma.bulletin.findMany({
    where: { status: 'published', OR: [{ htx_code: htxCode }, { htx_code: null }] },
    orderBy: { created_at: 'desc' },
    take: 50,
  })
  const posts = dbBulletins.map((b) => ({
    id: b.id,
    category: 'market',
    headline: b.commodity,
    summary: stripThinkingBlocks(b.bulletin_vi),
    date: timeAgo(b.created_at),
    sources: (Array.isArray(b.sources_json) ? b.sources_json.length : 0) || 1,
  })).filter((b) => b.summary.length > 0)

  const needle = q.toLocaleLowerCase('vi')
  const listed = posts.filter((b) => (category === 'all' || b.category === category) && (!needle || `${b.headline} ${b.summary}`.toLocaleLowerCase('vi').includes(needle)))
  const pages = Math.max(1, Math.ceil(listed.length / PAGE))
  const current = Math.min(pages, Math.max(1, Number(searchParams?.page) || 1))
  const shown = listed.slice((current - 1) * PAGE, current * PAGE)
  const count = (key: string) => posts.filter((b) => b.category === key).length
  const featured = posts[0]
  const samples = SAMPLES.filter((s) => category === 'all' || s.category === category)

  const url = (next: { category?: string; page?: number }) => {
    const params = new URLSearchParams()
    const chosen = next.category ?? category
    if (chosen !== 'all') params.set('category', chosen)
    if (q) params.set('q', q)
    if (next.page && next.page > 1) params.set('page', String(next.page))
    return params.toString() ? `/manager/bulletin?${params}` : '/manager/bulletin'
  }

  return (
    <div className={kit.page}>
      <PageHeader
        icon={<FileText size={28} />}
        title="Bản tin"
        description="Cập nhật tin tức, hoạt động, sự kiện và thông báo của HTX."
        actions={
          <>
            <ListenBulletinButton bulletinTexts={listed.map((b) => `${b.headline}. ${b.summary}`)} />
            <button type="button" className={kit.primary} disabled title="Chưa có chức năng viết bài"><Plus size={16} aria-hidden="true" />Viết bài mới <Sample /></button>
          </>
        }
      />

      <div className={ui.bar}>
        <nav className={ui.tabs} aria-label="Danh mục">
          {[{ key: 'all', label: 'Tất cả' }, ...CATEGORIES].map((c) => (
            <Link key={c.key} href={url({ category: c.key })} className={`${ui.tab} ${styles.tab}`} aria-current={category === c.key ? 'page' : undefined}>
              {c.label} ({c.key === 'all' ? posts.length : count(c.key)})
            </Link>
          ))}
        </nav>
        <form action="/manager/bulletin" method="get" className={`${styles.search} ${ui.grow}`} role="search">
          {category !== 'all' && <input type="hidden" name="category" value={category} />}
          <input type="search" name="q" defaultValue={q} className={ui.control} aria-label="Tìm bài viết" placeholder="Tìm kiếm bài viết..." />
          <button type="submit" className={ui.small} aria-label="Tìm"><Search size={15} aria-hidden="true" /></button>
        </form>
      </div>

      <div className={styles.columns}>
        <div className={styles.main}>
          <section className={kit.card} aria-label="Bài viết">
            <p className={styles.count}>{listed.length} bản tin</p>
            {listed.length === 0 ? (
              <p className={styles.empty}>{category === 'all' && !q ? 'Chưa có bản tin nào' : 'Không có bản tin nào trong mục này.'}</p>
            ) : shown.map((b) => (
              <article key={b.id} className={styles.post}>
                <span className={styles.thumb} style={{ backgroundImage: "url('/images/tea-hills-mist.jpg')" }} aria-hidden="true" />
                <div>
                  <span className={styles.badge}>{labelOf(b.category)}</span>
                  <h2>{b.headline}</h2>
                  <p>{b.summary}</p>
                  <small><CalendarDays size={13} aria-hidden="true" />{b.date} · {b.sources} nguồn</small>
                </div>
              </article>
            ))}
            {pages > 1 && (
              <nav className={ui.pager} aria-label="Phân trang">
                <span>Trang {current}/{pages}</span>
                <span className={ui.pages}>
                  <Link className={ui.page} href={url({ page: current - 1 })} aria-label="Trang trước"><ChevronLeft size={16} aria-hidden="true" /></Link>
                  <Link className={ui.page} href={url({ page: current + 1 })} aria-label="Trang sau"><ChevronRight size={16} aria-hidden="true" /></Link>
                </span>
              </nav>
            )}
          </section>

          {samples.length > 0 && !q && (
            <section className={kit.card} aria-label="Bố cục mẫu">
              <p className={styles.count}><Sample /> Bố cục mẫu: không phải tin thật.</p>
              {samples.map((s) => (
                <article key={s.headline} className={styles.post}>
                  <span className={styles.thumb} style={{ backgroundImage: `url('${s.image}')` }} aria-hidden="true" />
                  <div>
                    <span className={styles.badge}>{labelOf(s.category)}</span> <Sample />
                    <h2>{s.headline}</h2>
                    <p>{s.summary}</p>
                  </div>
                </article>
              ))}
            </section>
          )}
        </div>

        <aside className={styles.side}>
          <section className={styles.box}>
            <h2>Bài viết nổi bật</h2>
            {featured ? (
              <div className={styles.feature}><strong>{featured.headline}</strong></div>
            ) : <p className={styles.empty}>Chưa có bài viết.</p>}
          </section>
          <section className={styles.box}>
            <h2>Danh mục bài viết</h2>
            <ul>
              {CATEGORIES.map((c) => (
                <li key={c.key}>
                  <Link href={url({ category: c.key })}><span aria-hidden="true">{c.icon ?? <Leaf size={18} />}</span>{c.label}<b>{count(c.key)}</b></Link>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      {/* Weather — Real data from Open-Meteo */}
      <WeatherSection />

      <AiNote message="Nội dung do AI tổng hợp từ nguồn được duyệt, không phải khuyến nghị sản xuất hoặc đầu tư." />
    </div>
  )
}
