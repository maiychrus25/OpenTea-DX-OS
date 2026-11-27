// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Bookmark, FileCheck2 } from 'lucide-react'
import kit from '@/components/features/farmer-web/kit.module.css'
import { SampleTag } from '@/components/features/sample/SampleTag'
import { CATEGORIES, FEATURED, IMAGES, NEWS, OPENED_KEY, READS, dayOf, label, minutes, timeOf, type Category } from './news-data'
import styles from './newsroom.module.css'
import { PRESS } from './news-data'

const PRICES = [
  { name: 'Chè búp tươi', price: '45.000đ', change: 2 },
  { name: 'Chè khô Kim Tuyên', price: '420.000đ', change: 5 },
  { name: 'Chè khô Trung du', price: '350.000đ', change: -1 },
]

/** Seven days of the example price index, as points of a 300×60 sparkline. */
const TREND = '0,52 50,44 100,30 150,38 200,24 250,18 300,8'

const SAVED_KEY = 'farmer-saved-news'

const GROUPS: { title: string; match: (day: string) => boolean }[] = [
  { title: 'Hôm nay', match: day => day === 'Hôm nay' },
  { title: 'Hôm qua', match: day => day === 'Hôm qua' },
  { title: 'Trước đó', match: day => day !== 'Hôm nay' && day !== 'Hôm qua' },
]

export function Newsroom() {
  const [category, setCategory] = useState<Category | 'all'>('all')
  const [newestFirst, setNewestFirst] = useState(true)
  const [savedOnly, setSavedOnly] = useState(false)
  const [saved, setSaved] = useState<string[]>([])
  const [opened, setOpened] = useState<Record<string, number>>({})

  // Saved articles are kept in this browser; the page still works where storage is blocked.
  useEffect(() => {
    try {
      setSaved(JSON.parse(window.localStorage.getItem(SAVED_KEY) ?? '[]'))
      setOpened(JSON.parse(window.localStorage.getItem(OPENED_KEY) ?? '{}'))
    } catch {
      // keep the empty list
    }
  }, [])

  const toggleSaved = (id: string) => {
    const next = saved.includes(id) ? saved.filter(item => item !== id) : [...saved, id]
    setSaved(next)
    try {
      window.localStorage.setItem(SAVED_KEY, JSON.stringify(next))
    } catch {
      // kept for this visit only
    }
  }

  const readsOf = (id: string) => (READS[id] ?? 0) + (opened[id] ?? 0)
  const mostRead = [...NEWS].sort((a, b) => readsOf(b.id) - readsOf(a.id)).slice(0, 4)
  const hrefOf = (id: string) => `/farmer/bulletin/${id}`

  const filtered = category !== 'all' || savedOnly
  const list = NEWS.filter(item =>
    (category === 'all' || item.category === category) &&
    (!savedOnly || saved.includes(item.id)) &&
    (filtered || item.id !== FEATURED.id))
  const groups = newestFirst ? GROUPS : [...GROUPS].reverse()

  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <article className={`${kit.pn} ${styles.featured}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <Link href={hrefOf(FEATURED.id)} aria-hidden="true" tabIndex={-1} className={styles.cover}><img src={IMAGES[FEATURED.id]} alt="" /></Link>
          <div>
            <p className={`${styles.kicker} ${styles.weather}`}>{label(FEATURED.category)} · Nổi bật</p>
            <h2><Link href={hrefOf(FEATURED.id)}>{FEATURED.headline}</Link></h2>
            <p className={styles.clamp}>{FEATURED.summary}</p>
            <footer>
              <span>{FEATURED.date} · {FEATURED.sourceCount} nguồn · đọc {minutes(FEATURED.summary)} phút</span>
              <Link href={hrefOf(FEATURED.id)} className={styles.link}>
                Đọc tiếp <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </footer>
          </div>
        </article>

        <div className={styles.toolbar}>
          <div className={styles.pills} role="group" aria-label="Chuyên mục">
            <button type="button" aria-pressed={category === 'all'} onClick={() => { setCategory('all'); setSavedOnly(false) }}>Tất cả</button>
            {CATEGORIES.map(item => (
              <button key={item.value} type="button" aria-pressed={category === item.value} onClick={() => setCategory(item.value)}>
                <i className={styles[item.value]} aria-hidden="true" />{item.label}
              </button>
            ))}
          </div>
          <select aria-label="Sắp xếp" value={newestFirst ? 'new' : 'old'} onChange={event => setNewestFirst(event.target.value === 'new')}>
            <option value="new">Mới nhất</option>
            <option value="old">Cũ nhất</option>
          </select>
        </div>

        {list.length === 0 && <p className={styles.empty}>{savedOnly ? 'Bạn chưa lưu tin nào trong mục này.' : 'Chưa có tin trong mục này.'}</p>}
        {groups.map(group => {
          const items = list.filter(item => group.match(dayOf(item.date)))
          if (items.length === 0) return null
          return (
            <section key={group.title} aria-label={group.title}>
              <h3 className={styles.day}>{group.title}</h3>
              <ul className={`${kit.pn} ${styles.items}`}>
                {(newestFirst ? items : [...items].reverse()).map(item => (
                  <li key={item.id}>
                    {IMAGES[item.id]
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={IMAGES[item.id]} alt="" />
                      : <span className={styles.noPhoto}><FileCheck2 size={24} strokeWidth={1.5} aria-hidden="true" /></span>}
                    <Link href={hrefOf(item.id)} className={styles.story}>
                      <span className={styles.kicker}><i className={styles[item.category]} aria-hidden="true" />{label(item.category)}</span>
                      <strong>{item.headline}</strong>
                      <span className={`${styles.text} ${styles.clamp}`}>{item.summary}</span>
                      <small>{timeOf(item.date)} · {item.sourceCount} nguồn · đọc {minutes(item.summary)} phút</small>
                    </Link>
                    <button type="button" className={styles.save} aria-pressed={saved.includes(item.id)} aria-label={`Lưu tin: ${item.headline}`} onClick={() => toggleSaved(item.id)}>
                      <Bookmark size={18} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      <aside className={styles.side}>
        <section className={kit.pn} aria-label="Giá chè hôm nay">
          <div className={kit.ph}><h2>Giá chè hôm nay</h2><SampleTag /></div>
          <table className={styles.prices}>
            <thead><tr><th>Loại chè</th><th>Giá/kg</th><th>Thay đổi</th></tr></thead>
            <tbody>
              {PRICES.map(row => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{row.price}</td>
                  <td><span className={`${kit.tag} ${row.change > 0 ? kit.soft : kit.bd}`}>{row.change > 0 ? '▲' : '▼'} {Math.abs(row.change)}%</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <figure className={styles.trend}>
            <svg viewBox="0 0 300 60" preserveAspectRatio="none" role="img" aria-label="Giá chè 7 ngày qua có xu hướng tăng">
              <polygon points={`0,60 ${TREND} 300,60`} />
              <polyline points={TREND} />
            </svg>
            <figcaption>7 ngày qua · Giá tham khảo</figcaption>
          </figure>
        </section>

        <section className={kit.pn} aria-label="Đọc nhiều nhất">
          <div className={kit.ph}><h2>Đọc nhiều nhất</h2><SampleTag /></div>
          <ol className={styles.ranking}>
            {mostRead.map((item, index) => (
              <li key={item.id}>
                <Link href={hrefOf(item.id)}>
                  <b>{index + 1}</b>
                  {IMAGES[item.id]
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={IMAGES[item.id]} alt="" />
                    : <span className={styles.thumbIcon}><FileCheck2 size={18} strokeWidth={1.5} aria-hidden="true" /></span>}
                  <span>{item.headline}<small>{readsOf(item.id).toLocaleString('vi-VN')} lượt đọc</small></span>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section className={kit.pn} aria-label="Báo chí viết về chè">
          <div className={kit.ph}><h2>Báo chí viết về chè</h2></div>
          <ul className={styles.press}>
            {PRESS.map(item => (
              <li key={item.url}>
                <a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a>
                <small>{item.source}</small>
              </li>
            ))}
          </ul>
        </section>

        <section className={`${kit.pn} ${styles.savedBox}`} aria-label="Tin đã lưu">
          <Bookmark size={20} aria-hidden="true" />
          <span><strong>Tin đã lưu</strong><small>{saved.length} bài</small></span>
          <button type="button" className={styles.link} aria-pressed={savedOnly} onClick={() => setSavedOnly(!savedOnly)}>
            {savedOnly ? 'Xem tất cả' : 'Xem'} <ArrowRight size={14} aria-hidden="true" />
          </button>
        </section>
      </aside>
    </div>
  )
}
